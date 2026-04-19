import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/drizzle/db';

const PLACEHOLDER_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function generatePlaceholderName(): string {
  let out = 'Guest-';
  for (let i = 0; i < 6; i++) {
    out += PLACEHOLDER_ALPHABET.charAt(
      Math.floor(Math.random() * PLACEHOLDER_ALPHABET.length)
    );
  }
  return out;
}

export const auth = betterAuth({
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60, // 1 minute
    },
  },
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  plugins: [
    anonymous({
      generateName: generatePlaceholderName,
    }),
    nextCookies(),
  ],
});
