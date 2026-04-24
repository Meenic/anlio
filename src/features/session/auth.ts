import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/drizzle/db';
import { generateGuestName } from '@/features/session/random';

export const auth = betterAuth({
  session: {
    cookieCache: {
      enabled: true,
      // 10 minutes — signed cookie short-circuits the DB session lookup in
      // `requireAuth`. Revocation still propagates on explicit signout.
      maxAge: 60 * 10,
    },
  },
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  plugins: [
    anonymous({
      generateName: generateGuestName,
    }),
    nextCookies(),
  ],
});
