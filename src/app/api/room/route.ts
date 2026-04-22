import { jsonOk, requireAuth, validateBody } from '@/lib/api/validate';
import { withApiErrors } from '@/lib/api/with-api-errors';
import { nanoid } from 'nanoid';
import { randomString, UNAMBIGUOUS_ALPHABET } from '@/lib/random';
import {
  codeKey,
  deleteRoom,
  getRoomIdByCode,
  roomKey,
  setRoom,
  setRoomCode,
} from '@/modules/room/store';
import { createRoomWithCodeIfAbsent } from '@/modules/room/redis-scripts';
import { CreateRoomSchema, DEFAULT_ROOM_SETTINGS } from './schemas';
import type { Player, InternalRoomState } from '@/modules/room/types';

const MAX_CODE_RETRIES = 5;

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requireAuth(request);
    const body = await validateBody(request, CreateRoomSchema);

    for (let i = 0; i < MAX_CODE_RETRIES; i++) {
      const code = randomString(6, UNAMBIGUOUS_ALPHABET);
      const id = nanoid();
      const host: Player = {
        id: user.id,
        name: user.name ?? 'Host',
        avatarUrl: user.image ?? undefined,
        score: 0,
        wins: 0,
        ready: true,
        connected: false,
      };
      const state: InternalRoomState = {
        id,
        code,
        hostId: user.id,
        phase: 'lobby',
        players: { [user.id]: host },
        settings: { ...DEFAULT_ROOM_SETTINGS, ...(body.settings ?? {}) },
        currentQuestionIndex: 0,
        phaseEndsAt: null,
        createdAt: Date.now(),
        version: 1,
        questions: [],
        answers: {},
      };
      const created = await createRoomWithCodeIfAbsent(
        roomKey(id),
        codeKey(code),
        state
      );
      if (created) return jsonOk({ id, code }, 201);

      const existing = await getRoomIdByCode(code);
      if (existing) continue;
      await setRoom(state);
      try {
        await setRoomCode(code, id);
        return jsonOk({ id, code }, 201);
      } catch (error) {
        await deleteRoom(id).catch((err) => {
          console.error(
            `[createRoom] rollback room deletion failed id=${id}`,
            err
          );
        });
        throw error;
      }
    }

    return jsonOk({ error: 'code_collision' }, 503);
  });
}
