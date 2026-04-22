import 'dotenv/config';
import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { redis } from '@/lib/redis';
import {
  createRoomWithCodeIfAbsent,
  updateRoomIfVersion,
  submitAnswerAtomically,
  deleteRoomAndCode,
  unlockIfOwner,
} from './redis-scripts';
import type { InternalRoomState } from './types';

// Utility to generate unique test keys so we never hit real data
function createKeys() {
  const nonce = Math.random().toString(36).substring(2, 8);
  return {
    roomId: `test-room-${nonce}`,
    code: `TST${nonce.toUpperCase()}`,
    roomKey: `test:room:test-room-${nonce}`,
    codeKey: `test:code:TST${nonce.toUpperCase()}`,
  };
}

const cleanupKeys: string[] = [];

// Clean up all generated keys after tests
after(async () => {
  if (cleanupKeys.length > 0) {
    // Delete in batches to avoid overwhelming redis if there's a lot
    for (let i = 0; i < cleanupKeys.length; i += 50) {
      await redis.del(...cleanupKeys.slice(i, i + 50));
    }
  }
});

function registerCleanup(...keys: string[]) {
  cleanupKeys.push(...keys);
}

function mockRoom(id: string, code: string): InternalRoomState {
  return {
    id,
    code,
    hostId: 'player-1',
    phase: 'lobby',
    players: {
      'player-1': {
        id: 'player-1',
        name: 'Player 1',
        score: 0,
        ready: true,
        connected: false,
        wins: 0,
      },
    },
    settings: {
      questionCount: 5,
      timePerQuestion: 20,
      category: 'general',
      isPublic: true,
      answerMode: 'allow_changes_until_deadline',
    },
    currentQuestionIndex: 0,
    phaseEndsAt: null,
    createdAt: Date.now(),
    version: 1,
    questions: [],
    answers: {},
  };
}

describe('Redis Scripts', () => {
  describe('createRoomWithCodeIfAbsent', () => {
    test('creates room and code indexes properly', async () => {
      const { roomId, code, roomKey, codeKey } = createKeys();
      registerCleanup(roomKey, codeKey);

      const state = mockRoom(roomId, code);
      const created = await createRoomWithCodeIfAbsent(roomKey, codeKey, state);

      assert.strictEqual(created, true, 'Should successfully create room');

      const storedId = await redis.get<string>(codeKey);
      assert.strictEqual(
        storedId,
        roomId,
        'Code index mapped wrongly! Check ARGV array map.'
      );

      const storedRoom = await redis.get<InternalRoomState>(roomKey);
      assert.ok(storedRoom, 'Room payload missing');
      assert.strictEqual(storedRoom.id, roomId);
      assert.strictEqual(storedRoom.version, 1);
    });

    test('fails to create if code already exists', async () => {
      const { roomId, code, roomKey, codeKey } = createKeys();
      registerCleanup(roomKey, codeKey);

      // Pre-occupy code
      await redis.set(codeKey, 'some-other-room');

      const state = mockRoom(roomId, code);
      const created = await createRoomWithCodeIfAbsent(roomKey, codeKey, state);

      assert.strictEqual(
        created,
        false,
        'Should decline creation due to collision'
      );

      const storedRoom = await redis.get<InternalRoomState>(roomKey);
      assert.strictEqual(
        storedRoom,
        null,
        'Should not create room payload if code collides'
      );
    });

    test('applies the specified TTL to both keys', async () => {
      const { roomId, code, roomKey, codeKey } = createKeys();
      registerCleanup(roomKey, codeKey);

      const state = mockRoom(roomId, code);
      const ttl = 120; // 2 minutes
      const created = await createRoomWithCodeIfAbsent(
        roomKey,
        codeKey,
        state,
        ttl
      );
      assert.strictEqual(created, true);

      const roomTtl = await redis.ttl(roomKey);
      const codeTtl = await redis.ttl(codeKey);

      // Depending on execution speed, TTL should be <= 120 and > 110
      assert.ok(
        roomTtl > 110 && roomTtl <= ttl,
        `Room TTL ${roomTtl} is out of bounds`
      );
      assert.ok(
        codeTtl > 110 && codeTtl <= ttl,
        `Code TTL ${codeTtl} is out of bounds`
      );
    });
  });

  describe('updateRoomIfVersion', () => {
    test('updates when version strictly matches', async () => {
      const { roomId, code, roomKey, codeKey } = createKeys();
      registerCleanup(roomKey, codeKey);

      const state = mockRoom(roomId, code);
      await redis.set(roomKey, state);

      const nextState = { ...state, version: 2, phase: 'starting' as const };
      const updated = await updateRoomIfVersion(roomKey, 1, nextState);

      assert.strictEqual(updated, true);

      const stored = await redis.get<InternalRoomState>(roomKey);
      assert.strictEqual(stored?.version, 2);
      assert.strictEqual(stored?.phase, 'starting');
    });

    test('rejects update if version mismatches', async () => {
      const { roomId, code, roomKey, codeKey } = createKeys();
      registerCleanup(roomKey, codeKey);

      const state = mockRoom(roomId, code);
      await redis.set(roomKey, state);

      // Incorrect expected version!
      const updated = await updateRoomIfVersion(roomKey, 999, {
        ...state,
        version: 2,
      });

      assert.strictEqual(updated, false);
      const stored = await redis.get<InternalRoomState>(roomKey);
      assert.strictEqual(
        stored?.version,
        1,
        'Version bumped despite rejection'
      );
    });

    test('rejects update if room does not exist', async () => {
      const { roomKey } = createKeys();
      const updated = await updateRoomIfVersion(
        roomKey,
        1,
        mockRoom('foo', 'bar')
      );
      assert.strictEqual(
        updated,
        false,
        'Expected update to fail for non-existent room'
      );
    });

    test('succeeds if room has no version but expectedVersion is 0', async () => {
      const { roomId, code, roomKey, codeKey } = createKeys();
      registerCleanup(roomKey, codeKey);

      const state = mockRoom(roomId, code);
      delete (state as Partial<InternalRoomState>).version; // simulate legacy or missing version field
      await redis.set(roomKey, state);

      const nextState = { ...state, version: 1 };
      const updated = await updateRoomIfVersion(roomKey, 0, nextState);
      assert.strictEqual(updated, true);

      const stored = await redis.get<InternalRoomState>(roomKey);
      assert.strictEqual(stored?.version, 1);
    });

    test('throws a Lua error if existing room data is heavily corrupted (not JSON)', async () => {
      const { roomKey, codeKey } = createKeys();
      registerCleanup(roomKey, codeKey);

      await redis.set(roomKey, 'not-json-this-is-garbage-text');

      await assert.rejects(
        updateRoomIfVersion(roomKey, 0, mockRoom('foo', 'bar')),
        /ERR Error running script/,
        'Should fail Lua execution when cjson.decode encounters garbage'
      );
    });
  });

  describe('submitAnswerAtomically', () => {
    test('successfully records an answer and keeps original timestamp', async () => {
      const { roomId, code, roomKey, codeKey } = createKeys();
      registerCleanup(roomKey, codeKey);

      const state = mockRoom(roomId, code);
      state.phase = 'question'; // Must be in question phase
      await redis.set(roomKey, state);

      const answeredAt = Date.now() - 5000;

      const result = await submitAnswerAtomically(
        roomKey,
        'player-1',
        'opt-A',
        answeredAt
      );
      assert.strictEqual(result.status, 'updated');
      if (result.status === 'updated') {
        assert.strictEqual(result.room.answers['player-1'], 'opt-A');
        assert.strictEqual(
          result.room.players['player-1'].answeredAt,
          answeredAt
        );
        assert.strictEqual(result.room.version, 2);
      }

      // Override answer without locking
      const result2 = await submitAnswerAtomically(
        roomKey,
        'player-1',
        'opt-B',
        Date.now()
      );
      assert.strictEqual(result2.status, 'updated');
      if (result2.status === 'updated') {
        assert.strictEqual(result2.room.answers['player-1'], 'opt-B');
        // Original timestamp should be preserved!
        assert.strictEqual(
          result2.room.players['player-1'].answeredAt,
          answeredAt
        );
        assert.strictEqual(result2.room.version, 3);
      }
    });

    test('rejects secondary answers when lockOnFirstSubmit is true', async () => {
      const { roomId, code, roomKey, codeKey } = createKeys();
      registerCleanup(roomKey, codeKey);

      const state = mockRoom(roomId, code);
      state.phase = 'question';
      state.settings.answerMode = 'lock_on_first_submit';
      await redis.set(roomKey, state);

      // First submit
      await submitAnswerAtomically(roomKey, 'player-1', 'opt-A', Date.now());

      // Second submit
      const result2 = await submitAnswerAtomically(
        roomKey,
        'player-1',
        'opt-B',
        Date.now()
      );
      assert.strictEqual(result2.status, 'already_answered');
    });

    test('rejects answers for invalid states', async () => {
      const { roomId, code, roomKey, codeKey } = createKeys();
      registerCleanup(roomKey, codeKey);

      const state = mockRoom(roomId, code);
      // Room is in 'lobby' state, not 'question'
      await redis.set(roomKey, state);

      const result = await submitAnswerAtomically(
        roomKey,
        'player-1',
        'opt-A',
        Date.now()
      );
      assert.strictEqual(result.status, 'wrong_phase');

      // Fix state but drop player
      state.phase = 'question';
      state.players = {};
      await redis.set(roomKey, state);

      const result2 = await submitAnswerAtomically(
        roomKey,
        'player-1',
        'opt-A',
        Date.now()
      );
      assert.strictEqual(result2.status, 'not_member');
    });
  });

  describe('deleteRoomAndCode', () => {
    test('completely wipes out both keys', async () => {
      const { roomKey, codeKey } = createKeys();
      registerCleanup(roomKey, codeKey);

      await redis.set(roomKey, 'ROOM_DATA');
      await redis.set(codeKey, 'CODE_DATA');

      await deleteRoomAndCode(roomKey, codeKey);

      const room = await redis.get(roomKey);
      const code = await redis.get(codeKey);

      assert.strictEqual(room, null);
      assert.strictEqual(code, null);
    });

    test('returns successfully even if keys are already gone', async () => {
      const { roomKey, codeKey } = createKeys();
      // Deliberately do NOT set them
      await assert.doesNotReject(async () => {
        await deleteRoomAndCode(roomKey, codeKey);
      }, 'Should smoothly execute DEL even on missing keys without throwing errors');
    });
  });

  describe('unlockIfOwner', () => {
    test('unlocks successfully using valid token', async () => {
      const lockKey = `test-lock-${Math.random()}`;
      registerCleanup(lockKey);

      await redis.set(lockKey, 'my-token');

      const unlocked = await unlockIfOwner(lockKey, 'my-token');
      assert.strictEqual(unlocked, true);

      const exists = await redis.get(lockKey);
      assert.strictEqual(exists, null);
    });

    test('denies unlock for foreign token', async () => {
      const lockKey = `test-lock-${Math.random()}`;
      registerCleanup(lockKey);

      await redis.set(lockKey, 'my-token');

      const unlocked = await unlockIfOwner(lockKey, 'impostor-token');
      assert.strictEqual(unlocked, false);

      const exists = await redis.get(lockKey);
      assert.strictEqual(exists, 'my-token');
    });
  });
});
