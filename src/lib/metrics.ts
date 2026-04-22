import { AsyncLocalStorage } from 'node:async_hooks';

export type Metrics = {
  redis: number;
  db: number;
};

export const metricsStorage = new AsyncLocalStorage<Metrics>();

export function getMetrics() {
  return metricsStorage.getStore();
}

export function incrementRedis() {
  const metrics = getMetrics();
  if (metrics) metrics.redis++;
}

export function incrementDb() {
  const metrics = getMetrics();
  if (metrics) metrics.db++;
}
