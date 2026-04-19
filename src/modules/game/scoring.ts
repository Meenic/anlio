import { MAX_TIME_BONUS } from './constants';

export function calculateTimeBonus(
  answeredAt: number,
  questionStartedAt: number,
  timeLimitSeconds: number
): number {
  const elapsedMs = answeredAt - questionStartedAt;
  const elapsedSeconds = Math.max(0, elapsedMs / 1000);

  if (elapsedSeconds >= timeLimitSeconds) return 0;

  const ratio = 1 - elapsedSeconds / timeLimitSeconds;
  return Math.round(ratio * MAX_TIME_BONUS);
}
