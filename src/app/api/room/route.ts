import { nanoid } from 'nanoid';
import { jsonError, jsonOk, requireAuth, validateBody } from '@/lib/api/validate';
import { getRoomIdByCode, setRoom, setRoomCode } from '@/modules/room/store';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from '@/modules/room/constants';
import type { InternalRoomState, Player } from '@/modules/room/types';
import { CreateRoomSchema, DEFAULT_ROOM_SETTINGS } from './schemas';

const MAX_CODE_RETRIES = 5;

function generateCode(): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += ROOM_CODE_ALPHABET.charAt(
      Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)
    );
  }
  return out;
}

async function pickUniqueCode(): Promise<string | null> {
  for (let i = 0; i < MAX_CODE_RETRIES; i++) {
    const code = generateCode();
    const existing = await getRoomIdByCode(code);
    if (!existing) return code;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    // 1. Auth
    const user = await requireAuth(request);

    // 2. Validate + guard
    const body = await validateBody(request, CreateRoomSchema);

    const code = await pickUniqueCode();
    if (!code) {
      return jsonError(
        503,
        'code_collision',
        'Failed to allocate a unique room code; try again.'
      );
    }

    // 3. Mutate (initial write — no updateRoom yet, the room doesn't exist)
    const id = nanoid();
    const host: Player = {
      id: user.id,
      name: user.name ?? 'Host',
      avatarUrl: user.image ?? undefined,
      score: 0,
      ready: true, // host is implicitly ready
      connected: false, // becomes true when SSE opens
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
      questions: [],
      answers: {},
    };

    await setRoom(state);
    await setRoomCode(code, id);

    // 4. No broadcast — no listeners yet.
    return jsonOk({ id, code }, 201);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
