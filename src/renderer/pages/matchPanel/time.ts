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
  pausedAt: string | null = null,
  pausedSeconds = 0,
  now = Date.now(),
): { action: 'complete' } | { action: 'restore'; remainingSeconds: number; paused: boolean } | null {
  if (!startedAt || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;

  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return null;

  // While paused, elapsed time is frozen at the moment it was paused — not the
  // wall-clock "now" — so time spent paused (including across an app restart)
  // never counts against the game's remaining duration.
  const referenceNow = pausedAt ? Date.parse(pausedAt) : now;
  if (!Number.isFinite(referenceNow)) return null;

  // Clamp after subtracting pausedSeconds, not before — otherwise inconsistent
  // data (pausedSeconds larger than the wall-clock delta) could drive elapsed
  // negative and hand back more remaining time than the game's own duration.
  const elapsedSeconds = Math.max(0, Math.floor((referenceNow - startedMs) / 1000) - pausedSeconds);
  const remainingSeconds = Math.ceil(durationSeconds - elapsedSeconds);
  if (remainingSeconds <= 0) return { action: 'complete' };
  return { action: 'restore', remainingSeconds, paused: !!pausedAt };
}
