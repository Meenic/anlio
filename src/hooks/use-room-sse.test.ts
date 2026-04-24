/// <reference types="bun" />
import { describe, it, expect } from 'bun:test';
import { applyEvent } from './use-room-sse';
import type { RoomState, Player } from '@/features/room/types';

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

function baseState(): RoomState {
  return {
    id: 'room-id',
    code: 'ABCD12',
    hostId: 'host-1',
    phase: 'lobby',
    players: {
      'host-1': makePlayer('host-1', { ready: true }),
      'player-1': makePlayer('player-1'),
    },
    settings: {
      questionCount: 10,
      timePerQuestion: 20,
      category: 'general',
      answerMode: 'allow_changes_until_deadline',
      isPublic: false,
    },
    currentQuestionIndex: 0,
    phaseEndsAt: null,
    createdAt: Date.now(),
    answerCount: 0,
  };
}

describe('applyEvent', () => {
  it('drops non-sync events when prev is null', () => {
    const event = {
      event: 'ready_changed' as const,
      data: { playerId: 'host-1', ready: true },
    };
    expect(applyEvent(null, event)).toBeNull();
  });

  it('replaces state on state_sync', () => {
    const next: RoomState = { ...baseState(), phase: 'question' };
    const result = applyEvent(baseState(), { event: 'state_sync', data: next });
    expect(result!.phase).toBe('question');
  });

  it('patches ready_changed for the correct player', () => {
    const state = baseState();
    const result = applyEvent(state, {
      event: 'ready_changed',
      data: { playerId: 'player-1', ready: true },
    });
    expect(result!.players['player-1'].ready).toBe(true);
    expect(result!.players['host-1'].ready).toBe(true); // unchanged
  });

  it('handles two ready_changed events for the same player', () => {
    const state = baseState();
    let result = applyEvent(state, {
      event: 'ready_changed',
      data: { playerId: 'player-1', ready: true },
    });
    result = applyEvent(result!, {
      event: 'ready_changed',
      data: { playerId: 'player-1', ready: false },
    });
    expect(result!.players['player-1'].ready).toBe(false);
  });

  it('ignores ready_changed for a missing player', () => {
    const state = baseState();
    const result = applyEvent(state, {
      event: 'ready_changed',
      data: { playerId: 'ghost', ready: true },
    });
    expect(result).toEqual(state);
  });

  it('removes a player on player_kicked', () => {
    const state = baseState();
    const result = applyEvent(state, {
      event: 'player_kicked',
      data: { playerId: 'player-1' },
    });
    expect(result!.players['player-1']).toBeUndefined();
    expect(result!.players['host-1']).toBeDefined();
  });

  it('updates settings on settings_updated', () => {
    const state = baseState();
    const result = applyEvent(state, {
      event: 'settings_updated',
      data: { ...state.settings, questionCount: 5 },
    });
    expect(result!.settings.questionCount).toBe(5);
  });
});
