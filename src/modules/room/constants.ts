import { UNAMBIGUOUS_ALPHABET } from '@/lib/random';

const DEFAULT_OFFLINE_PLAYER_GRACE_MS = 15_000;
const MIN_OFFLINE_PLAYER_GRACE_MS = 1_000;

function parseDurationMs(raw: string | undefined, fallbackMs: number): number {
  if (!raw) return fallbackMs;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < MIN_OFFLINE_PLAYER_GRACE_MS) {
    return fallbackMs;
  }
  return parsed;
}

/** Minimum connected players required to start a game. */
export const MIN_PLAYERS = 2;

/** Maximum concurrent players per room. */
export const MAX_PLAYERS = 8;

/** Uppercase alphanumeric without ambiguous characters (0/O, 1/I, etc.).
 *  Re-exported from the shared alphabet constant so there is exactly one
 *  canonical literal in the codebase. */
export const ROOM_CODE_ALPHABET = UNAMBIGUOUS_ALPHABET;

/** Length of the human-readable join code. */
export const ROOM_CODE_LENGTH = 6;

/** Redis TTL for a room record, in seconds. */
export const ROOM_TTL_SECONDS = 60 * 60 * 2; // 2 hours

/**
 * How long a disconnected player remains in the room before server-side
 * auto-removal.
 *
 * Configurable via `ROOM_OFFLINE_PLAYER_GRACE_MS`.
 */
export const OFFLINE_PLAYER_GRACE_MS = parseDurationMs(
  process.env.ROOM_OFFLINE_PLAYER_GRACE_MS,
  DEFAULT_OFFLINE_PLAYER_GRACE_MS
);
