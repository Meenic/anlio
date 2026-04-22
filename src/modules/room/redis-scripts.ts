import { redis } from '@/lib/redis';
import { ROOM_TTL_SECONDS } from './constants';
import type { InternalRoomState } from './types';

type ScriptResult = number | string | null;

function mustRedisEval(): (
  script: string,
  keys: string[],
  args: Array<string | number>
) => Promise<ScriptResult> {
  const evalFn = (redis as unknown as { eval?: unknown }).eval;
  if (typeof evalFn !== 'function') {
    throw new Error('Redis eval is not available in this client.');
  }
  return evalFn as (
    script: string,
    keys: string[],
    args: Array<string | number>
  ) => Promise<ScriptResult>;
}

export async function unlockIfOwner(
  lockKey: string,
  ownerToken: string
): Promise<boolean> {
  const evalRedis = mustRedisEval();
  const result = await evalRedis(
    `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`,
    [lockKey],
    [ownerToken]
  );
  return Number(result) === 1;
}

export async function updateRoomIfVersion(
  roomKey: string,
  expectedVersion: number,
  nextState: InternalRoomState,
  ttlSeconds = ROOM_TTL_SECONDS
): Promise<boolean> {
  const evalRedis = mustRedisEval();
  const payload = JSON.stringify(nextState);
  const result = await evalRedis(
    `
local current = redis.call("GET", KEYS[1])
if not current then
  return -1
end
local decoded = cjson.decode(current)
local version = tonumber(decoded.version or 0)
if version ~= tonumber(ARGV[1]) then
  return 0
end
redis.call("SET", KEYS[1], ARGV[2], "EX", tonumber(ARGV[3]))
return 1
`,
    [roomKey],
    [expectedVersion, payload, ttlSeconds]
  );
  return Number(result) === 1;
}

export type SubmitAnswerResult =
  | { status: 'updated'; room: InternalRoomState }
  | {
      status:
        | 'not_found'
        | 'wrong_phase'
        | 'not_member'
        | 'already_answered'
        | 'conflict';
    };

export async function submitAnswerAtomically(
  roomRedisKey: string,
  playerId: string,
  optionId: string,
  answeredAt: number,
  lockOnFirstSubmit: boolean
): Promise<SubmitAnswerResult> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const room = await redis.get<InternalRoomState>(roomRedisKey);
    if (!room) return { status: 'not_found' };
    if (room.phase !== 'question') return { status: 'wrong_phase' };
    if (!room.players[playerId]) return { status: 'not_member' };
    if (lockOnFirstSubmit && room.answers[playerId] !== undefined) {
      return { status: 'already_answered' };
    }

    const firstAnsweredAt = room.players[playerId].answeredAt ?? answeredAt;
    const next: InternalRoomState = {
      ...room,
      version: (room.version ?? 0) + 1,
      answers: { ...room.answers, [playerId]: optionId },
      players: {
        ...room.players,
        [playerId]: {
          ...room.players[playerId],
          answeredAt: firstAnsweredAt,
        },
      },
    };

    const committed = await updateRoomIfVersion(
      roomRedisKey,
      room.version ?? 0,
      next,
      ROOM_TTL_SECONDS
    );
    if (committed) return { status: 'updated', room: next };
  }
  return { status: 'conflict' };
}

export async function createRoomWithCodeIfAbsent(
  roomRedisKey: string,
  codeRedisKey: string,
  roomState: InternalRoomState,
  ttlSeconds = ROOM_TTL_SECONDS
): Promise<boolean> {
  const evalRedis = mustRedisEval();
  const roomPayload = JSON.stringify(roomState);
  const result = await evalRedis(
    `
if redis.call("EXISTS", KEYS[1]) == 1 then
  return 0
end
redis.call("SET", KEYS[2], ARGV[1], "EX", tonumber(ARGV[2]))
redis.call("SET", KEYS[1], ARGV[3], "EX", tonumber(ARGV[2]))
return 1
`,
    [codeRedisKey, roomRedisKey],
    [roomState.id, ttlSeconds, roomPayload]
  );
  return Number(result) === 1;
}

export async function deleteRoomAndCode(
  roomRedisKey: string,
  codeRedisKey: string
): Promise<void> {
  const evalRedis = mustRedisEval();
  await evalRedis(
    `
redis.call("DEL", KEYS[1])
redis.call("DEL", KEYS[2])
return 1
`,
    [roomRedisKey, codeRedisKey],
    []
  );
}
