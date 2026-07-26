export interface SessionForCloseCompletion {
  id: string;
  startTime: string | null;
}

export interface SessionCloseCompletionDependencies {
  markCompleted(session: SessionForCloseCompletion): void;
  persist(): void;
  restoreActive(session: SessionForCloseCompletion): void;
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
