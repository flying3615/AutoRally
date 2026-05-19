export interface SessionDurationInput {
  startTime: string | null;
  endTime: string | null;
}

export function sessionDurationMinutes(startTime: string | null, endTime: string | null): number | null {
  if (!startTime || !endTime) return null;

  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  const duration = Math.round((end - start) / 60000);
  return duration >= 0 ? duration : null;
}

export function averageSessionDurationMinutes(sessions: SessionDurationInput[]): number | null {
  const durations = sessions
    .map(session => sessionDurationMinutes(session.startTime, session.endTime))
    .filter((duration): duration is number => duration !== null);

  if (durations.length === 0) return null;
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  return Math.round(total / durations.length);
}

export function safeSessionEndTime(startTime: string | null, requestedEndTime: string): string {
  if (!startTime) return requestedEndTime;

  const start = Date.parse(startTime);
  const end = Date.parse(requestedEndTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return requestedEndTime;

  return end < start ? startTime : requestedEndTime;
}
