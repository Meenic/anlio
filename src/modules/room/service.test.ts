import 'dotenv/config';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { redis } from '@/lib/redis';
import { registry } from '../sse/registry';
import {
  createRoom,
  joinRoom,
  setReady,
  startRoomGame,
  leaveRoom,
  kickPlayer,
} from './service';
import { getRoom, roomKey } from './store';
import { DEFAULT_ROOM_SETTINGS } from '@/app/api/room/schemas';

// --- Global Timeout Mocker ---
// We must mock setTimeout to prevent real games from running background loops
// for ~30 seconds, causing our test runner to hang indefinitely.
const originalSetTimeout = global.setTimeout;

before(() => {
  global.setTimeout = ((_cb: (...args: unknown[]) => void, _ms: number) => {
    // We intentionally swallow the callback so it doesn't run timers.
    // If we wanted to test the inner loops, we'd record `cb` and trigger it manually.
    return { unref: () => {} };
  }) as unknown as typeof setTimeout;
});

after(() => {
  global.setTimeout = originalSetTimeout;
});

// --- Test State Cleanup ---
const cleanupCodes: string[] = [];
after(async () => {
  if (cleanupCodes.length > 0) {
    // Delete room and code mappings (using prefix-free matching via store keys)
    for (const code of cleanupCodes) {
      const storedId = await redis.get(`code:${code}`);
      if (storedId) await redis.del(`room:${storedId}`);
      await redis.del(`code:${code}`);
    }
  }
});

function markForCleanup(code: string) {
  cleanupCodes.push(code);
}

// --- SSE Mocking ---
class MockSSEController {
  public chunks: string[] = [];
  public _disposed = false;

  enqueue(chunk: Uint8Array) {
    if (this._disposed) return;
    this.chunks.push(new TextDecoder().decode(chunk));
  }

  // Helper safely parses the chunk list into JSON payloads
  getEvents() {
    return this.chunks.flatMap((text) => {
      const matchEvent = text.match(/event: (.*)\n/);
      const matchData = text.match(/data: (.*)\n\n/);
      if (matchEvent && matchData) {
        return [{ event: matchEvent[1], data: JSON.parse(matchData[1]) }];
      }
      return [];
    });
  }
}

function attachMockSSE(roomId: string, playerId: string): MockSSEController {
  let roomMap = registry.get(roomId);
  if (!roomMap) {
    roomMap = new Map();
    registry.set(roomId, roomMap);
  }
  const mock = new MockSSEController();
  roomMap.set(
    playerId,
    mock as unknown as ReadableStreamDefaultController<Uint8Array>
  );
  return mock;
}

// --- Test Suite ---
describe('Room Service (Integration)', () => {
  describe('Create & Join Floors', () => {
    test('creates a room and properly restricts duplicate joining', async () => {
      const host = { id: 'u-host', name: 'Alpha' };
      const { id, code } = await createRoom({
        user: host,
        settings: undefined,
        defaultSettings: DEFAULT_ROOM_SETTINGS,
      });
      markForCleanup(code);

      const roomZero = await getRoom(id);
      assert.ok(roomZero, 'Room must exist');
      assert.strictEqual(roomZero.hostId, host.id);
      assert.strictEqual(roomZero.players[host.id].name, 'Alpha');

      // Attempt joining as ALREADY MEMBER
      const reJoin = await joinRoom({ user: host, code });
      assert.strictEqual(reJoin.id, id, 'Allows idempotency for host');

      const guest = { id: 'u-guest', name: 'Bravo' };
      const join = await joinRoom({ user: guest, code });
      assert.strictEqual(join.id, id);

      const roomWithGuest = await getRoom(id);
      assert.ok(
        roomWithGuest?.players['u-guest'],
        'Guest should be written to room cache'
      );
    });

    test('rejects join requests for non-existent codes', async () => {
      try {
        await joinRoom({ user: { id: 'test', name: 'err' }, code: 'FAKEEEE' });
        assert.fail('Expected joinRoom to fail');
      } catch (err) {
        assert.ok(err instanceof Response, 'Error must be a Response object');
        const response = err as Response;
        assert.strictEqual(response.status, 404);
        const data = await response.json();
        assert.strictEqual(data.error, 'room_not_found');
      }
    });
  });

  describe('Gameplay Startup Constraints', () => {
    test('startRoomGame respects minimum player bounds and readiness', async () => {
      const host = { id: 'u-host2', name: 'Host2' };
      const { id, code } = await createRoom({
        user: host,
        settings: undefined,
        defaultSettings: DEFAULT_ROOM_SETTINGS,
      });
      markForCleanup(code);

      // Must fail because players connected = 0 (we haven't set SSE connections yet)
      try {
        await startRoomGame({ roomId: id, playerId: host.id });
        assert.fail('Must block completely idle startups');
      } catch (err) {
        const response = err as Response;
        assert.strictEqual(response.status, 409);
        const data = await response.json();
        assert.strictEqual(data.error, 'not_enough_players');
      }

      // Attach dummy streams to trick game into thinking players are actively connected.
      // Additionally, the registry itself doesn't update the `connected` boolean in the room state,
      // the actual SSE backend `route.ts` does. Since we bypass `route.ts`, we must artificially
      // override the Redis state connected flags to true for testing start.
      const guest = { id: 'u-guest2', name: 'Guest2' };
      await joinRoom({ user: guest, code });

      await redis.eval(
        `
        local r = cjson.decode(redis.call('GET', KEYS[1]))
        r.players['u-host2'].connected = true
        r.players['u-guest2'].connected = true
        redis.call('SET', KEYS[1], cjson.encode(r))
        return 1
        `,
        [roomKey(id)],
        []
      );

      // Attempt start -> Fail, guest is NOT Ready
      try {
        await startRoomGame({ roomId: id, playerId: host.id });
        assert.fail(
          'Must block if any active participant apart from Host is unready'
        );
      } catch (err) {
        const response = err as Response;
        assert.strictEqual(response.status, 409);
        const data = await response.json();
        assert.strictEqual(data.error, 'not_all_ready');
      }

      // Guest readies up
      await setReady({ roomId: id, playerId: guest.id, ready: true });

      await startRoomGame({ roomId: id, playerId: host.id });

      const startedRoom = await getRoom(id);
      assert.strictEqual(startedRoom?.phase, 'starting');
      // Confirmed our global timeout mock safely aborted the game loops.
    });
  });

  describe('SSE Broadcasting', () => {
    test('kickPlayer aggressively unregisters target and broadcasts', async () => {
      const host = { id: 'host-kick', name: 'Host' };
      const guest = { id: 'guest-kick', name: 'Guest' };

      const { id, code } = await createRoom({
        user: host,
        settings: undefined,
        defaultSettings: DEFAULT_ROOM_SETTINGS,
      });
      markForCleanup(code);
      await joinRoom({ user: guest, code });

      // Attach mocked streams so we can see what Host observes
      const hostStream = attachMockSSE(id, host.id);

      await kickPlayer({ roomId: id, hostId: host.id, targetId: guest.id });

      const room = await getRoom(id);
      assert.ok(
        !room?.players[guest.id],
        'Player should be physically deleted from state'
      );

      // Verify Host received an SSE JSON payload specifying the eviction!
      const hostEvents = hostStream.getEvents();
      const kickEvent = hostEvents.find((e) => e.event === 'player_kicked');
      assert.ok(kickEvent, 'A player_kicked SSE event must be dispatched');
      assert.strictEqual(kickEvent.data.playerId, guest.id);
    });

    test('leaveRoom gracefully delegates Host privileges', async () => {
      const host = { id: 'host-leave', name: 'Host' };
      const guest = { id: 'guest-leave', name: 'Guest' };

      const { id, code } = await createRoom({
        user: host,
        settings: undefined,
        defaultSettings: DEFAULT_ROOM_SETTINGS,
      });
      markForCleanup(code);
      await joinRoom({ user: guest, code });

      const guestStream = attachMockSSE(id, guest.id);

      // Host leaves the room intentionally!
      await leaveRoom({ roomId: id, playerId: host.id });

      const room = await getRoom(id);
      assert.strictEqual(
        room?.hostId,
        guest.id,
        'Host rights MUST transfer to the surviving player'
      );

      const events = guestStream.getEvents();
      const transferEvent = events.find((e) => e.event === 'state_sync');

      assert.ok(
        transferEvent,
        'The new Host must be firmly hydrated with the updated synced state'
      );
      assert.strictEqual(transferEvent.data.hostId, guest.id);
    });
  });
});
