'use client';

import { useEffect, useState } from 'react';
import type { SSEEvent } from '@/features/realtime/events';
import type { RoomState } from '@/features/room/types';
import type {
  GameEndedPayload,
  LeaderboardPayload,
  QuestionPayload,
  RevealPayload,
} from '@/features/game/types';

/**
 * Connection status for the underlying `EventSource`.
 *
 * - `connecting`: before `onopen` fires, or immediately after a transient
 *   network blip triggered `onerror` and the browser is auto-reconnecting.
 * - `connected`: open TCP + HTTP/2 stream, server has acknowledged.
 * - `error`: `EventSource.onerror` fired. `EventSource` will keep retrying
 *   in the background on its own schedule — we do not retry manually. A new
 *   `state_sync` lands automatically on reconnect, so local state self-heals.
 *
 * The server-sent `error` **event** (app-level, e.g. validation failures)
 * is a separate channel — it populates `error: string` without flipping
 * this `status`.
 */
export type RoomSseStatus = 'connecting' | 'connected' | 'error';

export type UseRoomSseResult = {
  /** Room state — `null` until the first `state_sync` event. */
  state: RoomState | null;
  /** Connection-level status only. */
  status: RoomSseStatus;
  /** True only while waiting for the *initial* `state_sync`. After that stays
   *  false so transient reconnects don't flash skeletons. */
  loading: boolean;
  /** App-level error message from an SSE `error` event (rare). */
  error: string | null;
  /** True when the server sent a terminal error (e.g. `not_a_member`) and the
   *  EventSource has been permanently closed. The UI should redirect. */
  removed: boolean;
  /** Current question payload during the `question` phase. `null` otherwise.
   *  Transient — not reconstructible from `state` alone. */
  currentQuestion: QuestionPayload | null;
  /** Reveal payload during the `reveal` phase. `null` otherwise. */
  reveal: RevealPayload | null;
  /** Leaderboard payload during the `leaderboard` phase. `null` otherwise. */
  leaderboard: LeaderboardPayload | null;
  /** Final results during the `ended` phase. `null` otherwise. */
  gameEnded: GameEndedPayload | null;
};

/**
 * Apply a single `SSEEvent` to the local `RoomState` and return the next
 * state. `state_sync` REPLACES; every other event produces a minimal patch
 * derived from its payload — we never spread an entire `RoomState` object
 * for non-sync events.
 *
 * Events received before the first `state_sync` (i.e. `prev === null`) are
 * dropped rather than attempting to patch a null state. The first `state_sync`
 * will bring us to a consistent baseline and subsequent events will apply
 * cleanly.
 */
export function applyEvent(
  prev: RoomState | null,
  event: SSEEvent
): RoomState | null {
  if (event.event === 'state_sync') {
    return event.data;
  }

  if (prev === null) return null;

  switch (event.event) {
    case 'player_joined': {
      return {
        ...prev,
        players: { ...prev.players, [event.data.player.id]: event.data.player },
      };
    }
    case 'player_left': {
      // Transient disconnect only: keep the player in-room but mark them
      // offline until they reconnect or the server-side grace timer removes
      // them permanently.
      const existing = prev.players[event.data.playerId];
      if (!existing) return prev;
      return {
        ...prev,
        players: {
          ...prev.players,
          [event.data.playerId]: {
            ...existing,
            connected: false,
            disconnectedAt: event.data.disconnectedAt,
          },
        },
      };
    }
    case 'player_removed':
    case 'player_kicked': {
      // Permanent membership removal.
      const playerId = event.data.playerId;
      if (!prev.players[playerId]) return prev;
      const players = { ...prev.players };
      delete players[playerId];
      return { ...prev, players };
    }
    case 'settings_updated': {
      return { ...prev, settings: event.data };
    }
    case 'ready_changed': {
      const existing = prev.players[event.data.playerId];
      if (!existing) return prev;
      return {
        ...prev,
        players: {
          ...prev.players,
          [event.data.playerId]: { ...existing, ready: event.data.ready },
        },
      };
    }
    case 'game_starting': {
      return {
        ...prev,
        phase: 'starting',
        phaseEndsAt: Date.now() + event.data.startsIn * 1000,
      };
    }
    case 'question': {
      return {
        ...prev,
        phase: 'question',
        currentQuestionIndex: event.data.index,
        phaseEndsAt: event.data.phaseEndsAt,
        answerCount: 0,
      };
    }
    case 'answer_count': {
      return { ...prev, answerCount: event.data.answered };
    }
    case 'reveal': {
      // `correctOptionId` and `answers` belong to a separate game-level
      // store, not `RoomState`. We only patch scores/player deltas here.
      return {
        ...prev,
        phase: 'reveal',
        players: event.data.players,
      };
    }
    case 'leaderboard': {
      const players: Record<string, (typeof prev.players)[string]> = {
        ...prev.players,
      };
      for (const p of event.data.players) {
        players[p.id] = p;
      }
      return {
        ...prev,
        phase: 'leaderboard',
        players,
        phaseEndsAt: Date.now() + event.data.nextIn * 1000,
      };
    }
    case 'game_ended': {
      const players: Record<string, (typeof prev.players)[string]> = {
        ...prev.players,
      };
      for (const p of event.data.players) {
        players[p.id] = p;
      }
      return { ...prev, phase: 'ended', players };
    }
    case 'error': {
      // Handled by the caller via a dedicated state setter — no state patch.
      return prev;
    }
    default: {
      // Exhaustiveness check — if a new event is added to SSEEvent and not
      // handled above, TypeScript will fail here at compile time.
      event satisfies never;
      return prev;
    }
  }
}

export type UseRoomSseOptions = {
  /** Hydrated snapshot from the RSC / bootstrap action. When provided,
   *  `state` is populated from the FIRST render and `loading` is false —
   *  no skeleton flash while waiting for the initial SSE `state_sync`. */
  initialState?: RoomState | null;
};

/**
 * Owns the SSE connection for a room and exposes the current `RoomState`.
 *
 * - **Identity**: derived server-side from the session cookie; no identity
 *   param is accepted (passing one would let any caller impersonate).
 * - **Reconnection**: `EventSource` handles it natively. The server re-sends
 *   `state_sync` on every new connection, so local state self-corrects — no
 *   manual retry logic here.
 * - **Single source of truth**: no other code in the app should fetch or
 *   cache room state. Consumers read exclusively from this hook.
 */
export function useRoomSse(
  roomId: string,
  selfId?: string | null,
  options?: UseRoomSseOptions
): UseRoomSseResult {
  const initial = options?.initialState ?? null;
  const [state, setState] = useState<RoomState | null>(initial);
  const [status, setStatus] = useState<RoomSseStatus>('connecting');
  const [loading, setLoading] = useState(initial === null);
  const [appError, setAppError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [currentQuestion, setCurrentQuestion] =
    useState<QuestionPayload | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPayload | null>(
    null
  );
  const [gameEnded, setGameEnded] = useState<GameEndedPayload | null>(null);

  // Reset state when `roomId` changes — canonical "reset during render" pattern
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  // This avoids the setState-in-effect anti-pattern. React schedules the
  // re-render immediately, so consumers never see stale data from the previous
  // room.
  const [trackedRoomId, setTrackedRoomId] = useState(roomId);
  if (trackedRoomId !== roomId) {
    setTrackedRoomId(roomId);
    setState(initial);
    setStatus('connecting');
    setLoading(initial === null);
    setAppError(null);
    setRemoved(false);
    setCurrentQuestion(null);
    setReveal(null);
    setLeaderboard(null);
    setGameEnded(null);
  }

  useEffect(() => {
    if (!roomId) return;

    const es = new EventSource(`/api/room/${roomId}/sse`, {
      withCredentials: true,
    });

    const handleOpen = () => {
      setStatus('connected');
    };

    const handleError = () => {
      // Connection-level. Do NOT manually close or reopen — EventSource keeps
      // retrying on its own and a fresh state_sync will arrive on reconnect.
      setStatus('error');
    };

    es.addEventListener('open', handleOpen);
    es.addEventListener('error', handleError);

    /** Generic per-event handler. Parses JSON payload, runs the reducer. */
    function makeHandler<E extends SSEEvent['event']>(name: E) {
      return (raw: MessageEvent) => {
        let data: unknown;
        try {
          data = JSON.parse(raw.data);
        } catch {
          // Malformed payload — log and ignore. A subsequent event or the
          // next state_sync will restore consistency.
          console.error(`[use-room-sse] malformed ${name} payload`, raw.data);
          return;
        }

        // The cast is safe because the server broadcaster only emits typed
        // `SSEEvent` values; we're reuniting the named channel with its data.
        const event = { event: name, data } as SSEEvent;

        if (event.event === 'error') {
          setAppError(event.data.message);
          // Terminal errors: close the stream permanently so the browser
          // stops auto-reconnecting, and signal the UI to redirect.
          if (
            event.data.message === 'not_a_member' ||
            event.data.message === 'room_not_found'
          ) {
            es.close();
            setRemoved(true);
          }
          return;
        }

        // If we are the kicked player, close the stream immediately and
        // signal removal so the UI can redirect before the browser even
        // attempts to reconnect (which would hit not_a_member anyway).
        if (event.event === 'player_kicked' && event.data.playerId === selfId) {
          es.close();
          setRemoved(true);
          return;
        }

        setState((prev) => applyEvent(prev, event));
        if (event.event === 'state_sync') {
          setLoading(false);
          // On a cold state_sync, clear any stale transient payloads if the
          // room is no longer in that phase. (Re-syncs mid-game may land
          // while e.g. the `question` phase is active — in that case the
          // server will immediately follow with the `question` event.)
          if (event.data.phase === 'lobby' || event.data.phase === 'starting') {
            setCurrentQuestion(null);
            setReveal(null);
            setLeaderboard(null);
            setGameEnded(null);
          }
        } else if (event.event === 'game_starting') {
          setCurrentQuestion(null);
          setReveal(null);
          setLeaderboard(null);
          setGameEnded(null);
        } else if (event.event === 'question') {
          setCurrentQuestion(event.data);
          setReveal(null);
          setLeaderboard(null);
        } else if (event.event === 'reveal') {
          setReveal(event.data);
          setCurrentQuestion(null);
        } else if (event.event === 'leaderboard') {
          setLeaderboard(event.data);
          setReveal(null);
        } else if (event.event === 'game_ended') {
          setGameEnded(event.data);
          setLeaderboard(null);
          setReveal(null);
          setCurrentQuestion(null);
        }
      };
    }

    // Named handlers for EVERY event in the SSEEvent union. A compile-time
    // exhaustiveness check lives inside `applyEvent`; here the `handlers`
    // object's keys must also cover the union, enforced by the mapped type.
    const handlers: { [K in SSEEvent['event']]: (e: MessageEvent) => void } = {
      state_sync: makeHandler('state_sync'),
      player_joined: makeHandler('player_joined'),
      player_left: makeHandler('player_left'),
      player_removed: makeHandler('player_removed'),
      player_kicked: makeHandler('player_kicked'),
      settings_updated: makeHandler('settings_updated'),
      ready_changed: makeHandler('ready_changed'),
      game_starting: makeHandler('game_starting'),
      question: makeHandler('question'),
      answer_count: makeHandler('answer_count'),
      reveal: makeHandler('reveal'),
      leaderboard: makeHandler('leaderboard'),
      game_ended: makeHandler('game_ended'),
      error: makeHandler('error'),
    };

    for (const name of Object.keys(handlers) as Array<SSEEvent['event']>) {
      es.addEventListener(name, handlers[name] as EventListener);
    }

    return () => {
      es.removeEventListener('open', handleOpen);
      es.removeEventListener('error', handleError);
      for (const name of Object.keys(handlers) as Array<SSEEvent['event']>) {
        es.removeEventListener(name, handlers[name] as EventListener);
      }
      es.close();
    };
  }, [roomId, selfId]);

  return {
    state,
    status,
    loading,
    error: appError,
    removed,
    currentQuestion,
    reveal,
    leaderboard,
    gameEnded,
  };
}
