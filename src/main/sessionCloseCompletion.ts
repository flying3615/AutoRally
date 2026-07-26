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
    readonly persistenceError: unknown,
    readonly restorationError: unknown,
  ) {
    super('Unable to persist session completion and restore the active session');
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

export function completeSessionForClose(
  session: SessionForCloseCompletion,
  { markCompleted, persist, restoreActive }: SessionCloseCompletionDependencies,
): void {
  markCompleted(session);

  try {
    persist();
  } catch (persistenceError) {
    try {
      restoreActive(session);
    } catch (restorationError) {
      throw new SessionCloseCompletionRestoreError(persistenceError, restorationError);
    }

    throw persistenceError;
  }
}
