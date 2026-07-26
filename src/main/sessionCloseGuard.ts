export interface ActiveSessionForClose {
  id: string;
  startTime: string | null;
}

export function handleSessionCloseEvent(
  guard: Pick<SessionCloseGuard, 'canClose'>,
  event: { preventDefault(): void },
  reportError: (error: unknown) => void,
): void {
  try {
    if (!guard.canClose()) event.preventDefault();
  } catch (error) {
    event.preventDefault();
    try {
      reportError(error);
    } catch (reportingError) {
      console.error('Failed to report session close error:', reportingError);
    }
  }
}

export class SessionCloseGuard {
  private approved = false;

  constructor(
    private readonly getActiveSessions: () => ActiveSessionForClose[],
    private readonly confirmEndSession: () => boolean,
    private readonly endSessions: (sessions: ActiveSessionForClose[]) => void,
  ) {}

  canClose(): boolean {
    if (this.approved) return true;

    const sessions = this.getActiveSessions();
    if (sessions.length === 0) return true;

    if (!this.confirmEndSession()) {
      return false;
    }

    this.endSessions(sessions);
    this.approved = true;
    return true;
  }
}
