export function formatSecondsAsClock(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

export function pendingCountdownLabel(remaining: number, paused: boolean): string {
  if (paused) return `Paused at ${formatSecondsAsClock(remaining)}`;
  return `Auto-start in ${formatSecondsAsClock(remaining)}`;
}

export function getPlayingTimerRecovery(
  startedAt: string | null,
  durationSeconds: number,
  now = Date.now(),
): { action: 'complete' } | { action: 'restore'; remainingSeconds: number } | null {
  if (!startedAt || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;

  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return null;

  const elapsedSeconds = Math.max(0, Math.floor((now - startedMs) / 1000));
  const remainingSeconds = Math.ceil(durationSeconds - elapsedSeconds);
  if (remainingSeconds <= 0) return { action: 'complete' };
  return { action: 'restore', remainingSeconds };
}
