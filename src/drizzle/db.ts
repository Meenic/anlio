import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';
import { incrementDb } from '@/lib/metrics';

const baseDb = drizzle(process.env.DATABASE_URL!, { schema });

export const db = new Proxy(baseDb, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    // Common drizzle entry points like .select(), .insert(), etc.
    if (
      typeof value === 'function' &&
      ['select', 'insert', 'update', 'delete', 'execute'].includes(
        prop as string
      )
    ) {
      return (...args: unknown[]) => {
        incrementDb();
        return (value as (...args: unknown[]) => unknown).apply(target, args);
      };
    }
    return value;
  },
});
