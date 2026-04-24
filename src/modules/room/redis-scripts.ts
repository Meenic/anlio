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

// NOTE: `updateRoomIfVersion` and `submitAnswerAtomically` were removed
// together with the optimistic-CAS retry loop — mutations now serialize
// through an in-process per-room mutex (`./mutex.ts`), so a plain GET/SET
// pair via `updateRoom` replaces both. Revisit if we ever run multiple
// writer processes against the same Redis.

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
redis.call("SET", KEYS[2], ARGV[3], "EX", tonumber(ARGV[2]))
redis.call("SET", KEYS[1], ARGV[1], "EX", tonumber(ARGV[2]))
return 1
`,
    [codeRedisKey, roomRedisKey],
    [roomState.id, ttlSeconds, roomPayload]
  );
  return Number(result) === 1;
}

export async function deleteRoomAndCode(
  roomRedisKey: string,
  codeRedisKey: string,
  roomQuestionsRedisKey?: string
): Promise<void> {
  const evalRedis = mustRedisEval();
  // Optionally DEL the questions key in the same atomic call so we don't
  // leak a 20 KB blob when the room is torn down mid-game.
  if (roomQuestionsRedisKey) {
    await evalRedis(
      `
redis.call("DEL", KEYS[1])
redis.call("DEL", KEYS[2])
redis.call("DEL", KEYS[3])
return 1
`,
      [roomRedisKey, codeRedisKey, roomQuestionsRedisKey],
      []
    );
    return;
  }
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
