import type { SqlValue } from 'sql.js';
import { safeSessionEndTime } from './sessionDuration';

export interface SessionForCloseCompletion {
  id: string;
  startTime: string | null;
}

export interface SessionCloseCompletionDependencies {
  markCompleted(session: SessionForCloseCompletion): void;
  persist(): void;
  restoreActive(session: SessionForCloseCompletion): void;
}

export interface SessionCloseCompletionPersistenceDependencies {
  run(sql: string, params?: SqlValue[]): void;
  runWithoutAutosave(sql: string, params?: SqlValue[]): void;
  saveDb(): void;
  now(): string;
}

export class SessionCloseCompletionRestoreError extends Error {
  constructor(
    readonly completionError: unknown,
    readonly restorationError: unknown,
  ) {
    super('Unable to complete sessions and restore active sessions');
    this.name = 'SessionCloseCompletionRestoreError';
  }
}

export function createSessionCloseCompletionDependencies({
  run,
  runWithoutAutosave,
  saveDb,
  now,
}: SessionCloseCompletionPersistenceDependencies): SessionCloseCompletionDependencies {
  return {
    markCompleted: session => {
      run("UPDATE sessions SET endTime = ?, status = 'completed' WHERE id = ?", [
        safeSessionEndTime(session.startTime, now()),
        session.id,
      ]);
    },
    persist: saveDb,
    restoreActive: session => {
      runWithoutAutosave(
        "UPDATE sessions SET endTime = NULL, status = 'active' WHERE id = ?",
        [session.id],
      );
    },
  };
}

function restoreActiveSessions(
  sessions: readonly SessionForCloseCompletion[],
  restoreActive: (session: SessionForCloseCompletion) => void,
): unknown {
  let restorationError: unknown;

  for (const session of sessions) {
    try {
      restoreActive(session);
    } catch (error) {
      restorationError ??= error;
    }
  }

  return restorationError;
}

function rethrowAfterRestoring(
  completionError: unknown,
  completedSessions: readonly SessionForCloseCompletion[],
  restoreActive: (session: SessionForCloseCompletion) => void,
): never {
  const restorationError = restoreActiveSessions(completedSessions, restoreActive);
  if (restorationError !== undefined) {
    throw new SessionCloseCompletionRestoreError(completionError, restorationError);
  }

  throw completionError;
}

export function completeSessionsForClose(
  sessions: readonly SessionForCloseCompletion[],
  { markCompleted, persist, restoreActive }: SessionCloseCompletionDependencies,
): void {
  const completedSessions: SessionForCloseCompletion[] = [];

  try {
    for (const session of sessions) {
      markCompleted(session);
      completedSessions.push(session);
    }
  } catch (error) {
    rethrowAfterRestoring(error, completedSessions, restoreActive);
  }

  try {
    persist();
  } catch (error) {
    rethrowAfterRestoring(error, completedSessions, restoreActive);
  }
}
