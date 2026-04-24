/// <reference types="bun" />
import { describe, it, expect, mock, beforeEach, beforeAll } from 'bun:test';
import type { InternalRoomState, Player, RoomSettings } from './types';

/** Loose broadcast shape used only in test assertions. */
interface BroadcastMessage {
  event: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// In-memory Redis
// ---------------------------------------------------------------------------
const store = new Map<string, { value: string; expiresAt?: number }>();
function now() {
  return Date.now();
}

const memoryRedis = {
  get: async <T>(key: string): Promise<T | null> => {
    const e = store.get(key);
    if (!e) return null;
    if (e.expiresAt && now() > e.expiresAt) {
      store.delete(key);
      return null;
    }
    return JSON.parse(e.value);
  },
  set: async (key: string, value: unknown, opts?: { ex?: number }) => {
    store.set(key, {
      value: JSON.stringify(value),
      expiresAt: opts?.ex ? now() + opts.ex * 1000 : undefined,
    });
  },
  del: async (key: string) => {
    store.delete(key);
  },
  eval: async (
    script: string,
    keys: string[],
    args: Array<string | number>
  ): Promise<number> => {
    if (script.includes('cjson.decode')) {
      const [roomKey] = keys;
      const [expectedVersion, payload, ttl] = args;
      const entry = store.get(roomKey);
      if (!entry) return -1;
      const state = JSON.parse(entry.value);
      if ((state.version ?? 0) !== Number(expectedVersion)) return 0;
      store.set(roomKey, {
        value: payload as string,
        expiresAt: now() + Number(ttl) * 1000,
      });
      return 1;
    }
    if (script.includes('EXISTS')) {
      const [codeKey, roomKey] = keys;
      if (store.has(codeKey)) return 0;
      const [roomId, ttl, payload] = args;
      store.set(roomKey, {
        value: payload as string,
        expiresAt: now() + Number(ttl) * 1000,
      });
      store.set(codeKey, {
        value: JSON.stringify(roomId),
        expiresAt: now() + Number(ttl) * 1000,
      });
      return 1;
    }
    if (script.includes('redis.call("DEL"')) {
      store.delete(keys[0]);
      store.delete(keys[1]);
      return 1;
    }
    throw new Error('Unrecognized Lua script in mock eval');
  },
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
mock.module('@/lib/redis', () => ({ redis: memoryRedis }));

mock.module('@/features/session/auth', () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get('x-test-user-id');
        if (!id) return null;
        return { user: { id, name: `User-${id}`, image: null } };
      },
    },
  },
}));

const broadcastLog: Array<{ roomId: string; message: unknown }> = [];
mock.module('@/features/realtime/broadcaster', () => ({
  broadcast: (roomId: string, message: unknown) =>
    broadcastLog.push({ roomId, message }),
  sendToPlayer: () => {},
  pingClient: async () => {},
}));

mock.module('@/features/realtime/offline-removal', () => ({
  scheduleOfflineRemoval: () => {},
  cancelOfflineRemovalTimer: () => {},
}));

mock.module('@/features/realtime/registry', () => ({
  registry: new Map(),
  unregisterClient: () => {},
}));

mock.module('@/features/game/engine', () => ({
  startGame: async () => {},
  checkAllAnswered: () => false,
  revealQuestion: async () => {},
  generateQuestions: async () => [],
}));

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------
let createRoomPOST: typeof import('@/app/api/room/route').POST;
let joinRoomPOST: typeof import('@/app/api/room/join/route').POST;
let readyPOST: typeof import('@/app/api/room/[id]/ready/route').POST;
let settingsPOST: typeof import('@/app/api/room/[id]/settings/route').POST;
let kickPOST: typeof import('@/app/api/room/[id]/kick/route').POST;
let startPOST: typeof import('@/app/api/room/[id]/start/route').POST;
let leavePOST: typeof import('@/app/api/room/[id]/leave/route').POST;
let answerPOST: typeof import('@/app/api/room/[id]/answer/route').POST;
let roomStore: typeof import('@/features/room/store');

beforeAll(async () => {
  createRoomPOST = (await import('@/app/api/room/route')).POST;
  joinRoomPOST = (await import('@/app/api/room/join/route')).POST;
  readyPOST = (await import('@/app/api/room/[id]/ready/route')).POST;
  settingsPOST = (await import('@/app/api/room/[id]/settings/route')).POST;
  kickPOST = (await import('@/app/api/room/[id]/kick/route')).POST;
  startPOST = (await import('@/app/api/room/[id]/start/route')).POST;
  leavePOST = (await import('@/app/api/room/[id]/leave/route')).POST;
  answerPOST = (await import('@/app/api/room/[id]/answer/route')).POST;
  roomStore = await import('@/features/room/store');
});

beforeEach(() => {
  store.clear();
  broadcastLog.length = 0;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown, userId?: string): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (userId) headers.set('x-test-user-id', userId);
  return new Request('http://localhost', {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
async function parseJson<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}
function baseSettings(): RoomSettings {
  return {
    questionCount: 10,
    timePerQuestion: 20,
    category: 'general',
    answerMode: 'allow_changes_until_deadline',
    isPublic: false,
  };
}
function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: `User-${id}`,
    score: 0,
    wins: 0,
    ready: false,
    connected: true,
    ...overrides,
  };
}
function seedRoom(state: InternalRoomState) {
  store.set(`room:${state.id}`, { value: JSON.stringify(state) });
  store.set(`code:${state.code}`, { value: JSON.stringify(state.id) });
}
function baseRoom(
  overrides: Partial<InternalRoomState> = {}
): InternalRoomState {
  return {
    id: 'room-id',
    code: 'ABCD12',
    hostId: 'host-1',
    phase: 'lobby',
    players: { 'host-1': makePlayer('host-1', { ready: true }) },
    settings: baseSettings(),
    currentQuestionIndex: 0,
    phaseEndsAt: null,
    createdAt: now(),
    version: 1,
    answers: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /api/room
// ---------------------------------------------------------------------------
describe('POST /api/room', () => {
  it('creates a room and returns 201', async () => {
    const res = await createRoomPOST(makeRequest({}, 'host-1'));
    expect(res.status).toBe(201);
    const body = await parseJson<{ id: string; code: string }>(res);
    expect(body.id).toBeString();
    expect(body.code).toBeString();
    expect(body.code.length).toBe(6);
    const room = await memoryRedis.get<InternalRoomState>(`room:${body.id}`);
    expect(room).not.toBeNull();
    expect(room!.hostId).toBe('host-1');
  });

  it('applies custom settings', async () => {
    const res = await createRoomPOST(
      makeRequest(
        { settings: { questionCount: 5, category: 'science' } },
        'host-1'
      )
    );
    expect(res.status).toBe(201);
    const body = await parseJson<{ id: string }>(res);
    const room = await memoryRedis.get<InternalRoomState>(`room:${body.id}`);
    expect(room!.settings.questionCount).toBe(5);
    expect(room!.settings.category).toBe('science');
    expect(room!.settings.timePerQuestion).toBe(20);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await createRoomPOST(makeRequest({}));
    expect(res.status).toBe(401);
    const body = await parseJson<{ error: string }>(res);
    expect(body.error).toBe('unauthorized');
  });

  it('returns 400 for invalid body', async () => {
    const res = await createRoomPOST(
      makeRequest({ settings: { questionCount: 99 } }, 'host-1')
    );
    expect(res.status).toBe(400);
    const body = await parseJson<{ error: string }>(res);
    expect(body.error).toBe('validation_failed');
  });
});

// ---------------------------------------------------------------------------
// POST /api/room/join
// ---------------------------------------------------------------------------
describe('POST /api/room/join', () => {
  it('joins an existing lobby room', async () => {
    seedRoom(baseRoom());
    const res = await joinRoomPOST(makeRequest({ code: 'ABCD12' }, 'player-1'));
    expect(res.status).toBe(200);
    const body = await parseJson<{ id: string; code: string }>(res);
    expect(body.id).toBe('room-id');
    const room = await memoryRedis.get<InternalRoomState>('room:room-id');
    expect(room!.players['player-1']).toBeDefined();
  });

  it('returns 404 for missing code', async () => {
    const res = await joinRoomPOST(makeRequest({ code: 'ZZZZZZ' }, 'p1'));
    expect(res.status).toBe(404);
    expect((await parseJson<{ error: string }>(res)).error).toBe(
      'room_not_found'
    );
  });

  it('returns 409 when not in lobby phase', async () => {
    seedRoom(baseRoom({ phase: 'question' }));
    const res = await joinRoomPOST(makeRequest({ code: 'ABCD12' }, 'p1'));
    expect(res.status).toBe(409);
    expect((await parseJson<{ error: string }>(res)).error).toBe('wrong_phase');
  });

  it('returns 409 when room is full', async () => {
    const players: Record<string, Player> = {};
    for (let i = 0; i < 8; i++) players[`p-${i}`] = makePlayer(`p-${i}`);
    seedRoom(baseRoom({ players }));
    const res = await joinRoomPOST(makeRequest({ code: 'ABCD12' }, 'extra'));
    expect(res.status).toBe(409);
    expect((await parseJson<{ error: string }>(res)).error).toBe('room_full');
  });

  it('is idempotent for duplicate joins', async () => {
    seedRoom(
      baseRoom({
        players: {
          'host-1': makePlayer('host-1', { ready: true }),
          'player-1': makePlayer('player-1'),
        },
      })
    );
    const res = await joinRoomPOST(makeRequest({ code: 'ABCD12' }, 'player-1'));
    expect(res.status).toBe(200);
    const room = await memoryRedis.get<InternalRoomState>('room:room-id');
    expect(Object.keys(room!.players)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// POST /api/room/:id/ready
// ---------------------------------------------------------------------------
describe('POST /api/room/:id/ready', () => {
  it('toggles ready and broadcasts', async () => {
    seedRoom(
      baseRoom({
        players: {
          'host-1': makePlayer('host-1', { ready: true }),
          'player-1': makePlayer('player-1', { ready: false }),
        },
      })
    );
    const res = await readyPOST(
      makeRequest({ ready: true }, 'player-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(204);
    const room = await memoryRedis.get<InternalRoomState>('room:room-id');
    expect(room!.players['player-1'].ready).toBe(true);
    expect(
      broadcastLog.some(
        (b) =>
          b.roomId === 'room-id' &&
          (b.message as BroadcastMessage).event === 'ready_changed'
      )
    ).toBe(true);
  });

  it('returns 403 for a non-member', async () => {
    seedRoom(baseRoom());
    const res = await readyPOST(
      makeRequest({ ready: true }, 'stranger'),
      makeParams('room-id')
    );
    expect(res.status).toBe(403);
    expect((await parseJson<{ error: string }>(res)).error).toBe(
      'not_a_member'
    );
  });

  it('returns 409 when not in lobby', async () => {
    seedRoom(baseRoom({ phase: 'question' }));
    const res = await readyPOST(
      makeRequest({ ready: true }, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(409);
    expect((await parseJson<{ error: string }>(res)).error).toBe('wrong_phase');
  });

  it('skips broadcast when unchanged', async () => {
    seedRoom(baseRoom());
    const res = await readyPOST(
      makeRequest({ ready: true }, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(204);
    expect(
      broadcastLog.filter(
        (b) =>
          b.roomId === 'room-id' &&
          (b.message as BroadcastMessage).event === 'ready_changed'
      )
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/room/:id/settings
// ---------------------------------------------------------------------------
describe('POST /api/room/:id/settings', () => {
  it('allows host to update settings', async () => {
    seedRoom(baseRoom());
    const res = await settingsPOST(
      makeRequest({ questionCount: 5, category: 'history' }, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(204);
    const room = await memoryRedis.get<InternalRoomState>('room:room-id');
    expect(room!.settings.questionCount).toBe(5);
    expect(room!.settings.category).toBe('history');
    expect(
      broadcastLog.some(
        (b) =>
          b.roomId === 'room-id' &&
          (b.message as BroadcastMessage).event === 'settings_updated'
      )
    ).toBe(true);
  });

  it('returns 403 for non-host', async () => {
    seedRoom(
      baseRoom({
        players: {
          'host-1': makePlayer('host-1'),
          'player-1': makePlayer('player-1'),
        },
      })
    );
    const res = await settingsPOST(
      makeRequest({ questionCount: 5 }, 'player-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(403);
    expect((await parseJson<{ error: string }>(res)).error).toBe('not_host');
  });

  it('returns 409 when not in lobby', async () => {
    seedRoom(baseRoom({ phase: 'question' }));
    const res = await settingsPOST(
      makeRequest({ questionCount: 5 }, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(409);
    expect((await parseJson<{ error: string }>(res)).error).toBe('wrong_phase');
  });

  it('round-trips hidden settings (answerMode and isPublic)', async () => {
    seedRoom(baseRoom());
    const res = await settingsPOST(
      makeRequest(
        { answerMode: 'lock_on_first_submit', isPublic: true },
        'host-1'
      ),
      makeParams('room-id')
    );
    expect(res.status).toBe(204);
    const room = await memoryRedis.get<InternalRoomState>('room:room-id');
    expect(room!.settings.answerMode).toBe('lock_on_first_submit');
    expect(room!.settings.isPublic).toBe(true);
    expect(
      broadcastLog.some(
        (b) =>
          b.roomId === 'room-id' &&
          (b.message as BroadcastMessage).event === 'settings_updated'
      )
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/room/:id/kick
// ---------------------------------------------------------------------------
describe('POST /api/room/:id/kick', () => {
  it('allows host to kick a player', async () => {
    seedRoom(
      baseRoom({
        players: {
          'host-1': makePlayer('host-1', { ready: true }),
          'player-1': makePlayer('player-1'),
        },
      })
    );
    const res = await kickPOST(
      makeRequest({ targetId: 'player-1' }, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(204);
    const room = await memoryRedis.get<InternalRoomState>('room:room-id');
    expect(room!.players['player-1']).toBeUndefined();
    expect(
      broadcastLog.some(
        (b) =>
          b.roomId === 'room-id' &&
          (b.message as BroadcastMessage).event === 'player_kicked'
      )
    ).toBe(true);
  });

  it('returns 403 for non-host', async () => {
    seedRoom(
      baseRoom({
        players: {
          'host-1': makePlayer('host-1'),
          'player-1': makePlayer('player-1'),
        },
      })
    );
    const res = await kickPOST(
      makeRequest({ targetId: 'host-1' }, 'player-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(403);
    expect((await parseJson<{ error: string }>(res)).error).toBe('not_host');
  });

  it('returns 400 when kicking self', async () => {
    seedRoom(baseRoom());
    const res = await kickPOST(
      makeRequest({ targetId: 'host-1' }, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(400);
    expect((await parseJson<{ error: string }>(res)).error).toBe(
      'cannot_kick_self'
    );
  });

  it('returns 404 for target not in room', async () => {
    seedRoom(baseRoom());
    const res = await kickPOST(
      makeRequest({ targetId: 'ghost' }, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(404);
    expect((await parseJson<{ error: string }>(res)).error).toBe(
      'target_not_member'
    );
  });

  it('returns 409 when not in lobby', async () => {
    seedRoom(
      baseRoom({
        phase: 'question',
        players: {
          'host-1': makePlayer('host-1'),
          'player-1': makePlayer('player-1'),
        },
      })
    );
    const res = await kickPOST(
      makeRequest({ targetId: 'player-1' }, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(409);
    expect((await parseJson<{ error: string }>(res)).error).toBe('wrong_phase');
  });

  it('returns 404 when target leaves before kick is processed', async () => {
    seedRoom(
      baseRoom({
        players: {
          'host-1': makePlayer('host-1', { ready: true }),
          'player-1': makePlayer('player-1'),
        },
      })
    );
    // Simulate the player leaving (race condition) by removing them from the store
    const room = await memoryRedis.get<InternalRoomState>('room:room-id');
    delete room!.players['player-1'];
    await memoryRedis.set('room:room-id', room);

    const res = await kickPOST(
      makeRequest({ targetId: 'player-1' }, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(404);
    expect((await parseJson<{ error: string }>(res)).error).toBe(
      'target_not_member'
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/room/:id/start
// ---------------------------------------------------------------------------
describe('POST /api/room/:id/start', () => {
  it('starts the game when preconditions are met', async () => {
    seedRoom(
      baseRoom({
        players: {
          'host-1': makePlayer('host-1', { ready: true }),
          'player-1': makePlayer('player-1', { ready: true }),
        },
      })
    );
    const res = await startPOST(
      makeRequest({}, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(202);
  });

  it('returns 403 for non-host', async () => {
    seedRoom(
      baseRoom({
        players: {
          'host-1': makePlayer('host-1', { ready: true }),
          'player-1': makePlayer('player-1', { ready: true }),
        },
      })
    );
    const res = await startPOST(
      makeRequest({}, 'player-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(403);
    expect((await parseJson<{ error: string }>(res)).error).toBe('not_host');
  });

  it('returns 409 when not enough connected players', async () => {
    seedRoom(baseRoom());
    const res = await startPOST(
      makeRequest({}, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(409);
    expect((await parseJson<{ error: string }>(res)).error).toBe(
      'not_enough_players'
    );
  });

  it('returns 409 when not all players are ready', async () => {
    seedRoom(
      baseRoom({
        players: {
          'host-1': makePlayer('host-1', { ready: true }),
          'player-1': makePlayer('player-1', { ready: false }),
        },
      })
    );
    const res = await startPOST(
      makeRequest({}, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(409);
    expect((await parseJson<{ error: string }>(res)).error).toBe(
      'not_all_ready'
    );
  });

  it('returns 409 when not in lobby', async () => {
    seedRoom(baseRoom({ phase: 'question' }));
    const res = await startPOST(
      makeRequest({}, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(409);
    expect((await parseJson<{ error: string }>(res)).error).toBe('wrong_phase');
  });

  it('returns 404 when room does not exist', async () => {
    const res = await startPOST(
      makeRequest({}, 'host-1'),
      makeParams('missing-room')
    );
    expect(res.status).toBe(404);
    expect((await parseJson<{ error: string }>(res)).error).toBe(
      'room_not_found'
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/room/:id/leave
// ---------------------------------------------------------------------------
describe('POST /api/room/:id/leave', () => {
  it('removes the player and broadcasts', async () => {
    seedRoom(
      baseRoom({
        players: {
          'host-1': makePlayer('host-1', { ready: true }),
          'player-1': makePlayer('player-1'),
        },
      })
    );
    const res = await leavePOST(
      makeRequest({}, 'player-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(204);
    const room = await memoryRedis.get<InternalRoomState>('room:room-id');
    expect(room!.players['player-1']).toBeUndefined();
    expect(
      broadcastLog.some(
        (b) =>
          b.roomId === 'room-id' &&
          (b.message as BroadcastMessage).event === 'player_removed'
      )
    ).toBe(true);
  });

  it('deletes the room when the last player leaves', async () => {
    seedRoom(baseRoom());
    const res = await leavePOST(
      makeRequest({}, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(204);
    expect(store.has('room:room-id')).toBe(false);
    expect(store.has('code:ABCD12')).toBe(false);
  });

  it('transfers host when the host leaves', async () => {
    seedRoom(
      baseRoom({
        players: {
          'host-1': makePlayer('host-1', { ready: true }),
          'player-1': makePlayer('player-1'),
        },
      })
    );
    await leavePOST(makeRequest({}, 'host-1'), makeParams('room-id'));
    const room = await memoryRedis.get<InternalRoomState>('room:room-id');
    expect(room!.hostId).toBe('player-1');
    expect(
      broadcastLog.some(
        (b) =>
          b.roomId === 'room-id' &&
          (b.message as BroadcastMessage).event === 'state_sync'
      )
    ).toBe(true);
  });

  it('allows leaving even when not in lobby phase', async () => {
    seedRoom(
      baseRoom({
        phase: 'question',
        players: {
          'host-1': makePlayer('host-1', { ready: true }),
          'player-1': makePlayer('player-1'),
        },
      })
    );
    const res = await leavePOST(
      makeRequest({}, 'player-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(204);
    const room = await memoryRedis.get<InternalRoomState>('room:room-id');
    expect(room!.players['player-1']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/room/:id/answer
// ---------------------------------------------------------------------------
describe('POST /api/room/:id/answer', () => {
  it('returns 409 when the room is not in question phase', async () => {
    seedRoom(baseRoom());
    const res = await answerPOST(
      makeRequest({ optionId: 'opt-a' }, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(409);
    expect((await parseJson<{ error: string }>(res)).error).toBe('wrong_phase');
  });

  it('returns 403 when the player is not a member', async () => {
    seedRoom(baseRoom({ phase: 'question', phaseEndsAt: now() + 60_000 }));
    const res = await answerPOST(
      makeRequest({ optionId: 'opt-a' }, 'stranger'),
      makeParams('room-id')
    );
    expect(res.status).toBe(403);
    expect((await parseJson<{ error: string }>(res)).error).toBe(
      'not_a_member'
    );
  });

  it('accepts a valid answer during the question phase', async () => {
    seedRoom(
      baseRoom({
        phase: 'question',
        phaseEndsAt: now() + 60_000,
        players: {
          'host-1': makePlayer('host-1'),
        },
      })
    );
    const res = await answerPOST(
      makeRequest({ optionId: 'opt-a' }, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(204);
    const room = await memoryRedis.get<InternalRoomState>('room:room-id');
    expect(room!.answers['host-1']).toBe('opt-a');
    expect(
      broadcastLog.some(
        (b) =>
          b.roomId === 'room-id' &&
          (b.message as BroadcastMessage).event === 'answer_count'
      )
    ).toBe(true);
  });

  it('returns 410 when the phase has expired', async () => {
    seedRoom(
      baseRoom({
        phase: 'question',
        phaseEndsAt: now() - 1,
        players: {
          'host-1': makePlayer('host-1'),
        },
      })
    );
    const res = await answerPOST(
      makeRequest({ optionId: 'opt-a' }, 'host-1'),
      makeParams('room-id')
    );
    expect(res.status).toBe(410);
    expect((await parseJson<{ error: string }>(res)).error).toBe(
      'phase_expired'
    );
  });
});

// ---------------------------------------------------------------------------
// Store layer
// ---------------------------------------------------------------------------
describe('room store', () => {
  it('updateRoom increments version on change', async () => {
    seedRoom(baseRoom());
    const updated = await roomStore.updateRoom('room-id', (r) => ({
      ...r,
      phase: 'question',
    }));
    expect(updated.phase).toBe('question');
    expect(updated.version).toBe(2);
  });

  it('updateRoom skips write when updater returns the same object', async () => {
    seedRoom(baseRoom({ version: 3 }));
    const updated = await roomStore.updateRoom('room-id', (r) => r);
    expect(updated.version).toBe(3);
  });

  it('updateRoom throws when the room does not exist', async () => {
    expect(roomStore.updateRoom('missing', (r) => r)).rejects.toThrow(
      'Room not found'
    );
  });

  it('toPublicState omits private fields and derives answerCount', () => {
    const state: InternalRoomState = {
      ...baseRoom(),
      answers: { a: 'opt-a', b: 'opt-b' },
    };
    const pub = roomStore.toPublicState(state);
    // `questions` lives in a separate Redis key now — it must never appear
    // on the public payload regardless of where it's stored.
    expect((pub as Record<string, unknown>).questions).toBeUndefined();
    expect((pub as Record<string, unknown>).answers).toBeUndefined();
    expect(pub.answerCount).toBe(2);
  });
});
