/**
 * Uppercase alphanumeric without visually ambiguous characters (0/O, 1/I/L).
 * Safe for codes a player reads off the screen and types into another device.
 *
 * Used by both the room-code generator and the guest-name generator — those
 * two concerns happen to want the same alphabet. If that ever diverges,
 * split this constant.
 */
export const UNAMBIGUOUS_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Suffix length for `Guest-XXXXXX` placeholder display names. */
export const GUEST_NAME_SUFFIX_LENGTH = 6;

/**
 * Pick `length` characters uniformly at random from `alphabet`.
 *
 * `Math.random()` is intentional — these values are neither secrets nor
 * used for security decisions (room-code uniqueness is enforced via a
 * post-generation Redis lookup, and guest names are always overwritten by
 * the player-chosen name in `getOrCreateSession`).
 */
export function randomString(
  length: number,
  alphabet: string = UNAMBIGUOUS_ALPHABET
): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}

/** Generate a `Guest-XXXXXX` placeholder display name. */
export function generateGuestName(): string {
  return `Guest-${randomString(GUEST_NAME_SUFFIX_LENGTH)}`;
}
