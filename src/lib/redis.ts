import { Redis } from '@upstash/redis';
import { incrementRedis } from './metrics';

const client = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const redis = new Proxy(client, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === 'function') {
      return (...args: unknown[]) => {
        incrementRedis();
        return (value as (...args: unknown[]) => unknown).apply(target, args);
      };
    }
    return value;
  },
});
