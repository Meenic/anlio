import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/drizzle/db';
import { generateGuestName } from '@/lib/random';

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
      generateName: generateGuestName,
    }),
    nextCookies(),
  ],
});
