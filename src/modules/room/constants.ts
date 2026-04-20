import { UNAMBIGUOUS_ALPHABET } from '@/lib/random';

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
