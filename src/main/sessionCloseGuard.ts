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
    reportError(error);
  }
}

export class SessionCloseGuard {
  private approved = false;

  constructor(
    private readonly getActiveSession: () => ActiveSessionForClose | undefined,
    private readonly confirmEndSession: () => boolean,
    private readonly endSession: (session: ActiveSessionForClose) => void,
  ) {}

  canClose(): boolean {
    if (this.approved) return true;

    const session = this.getActiveSession();
    if (!session) {
      this.approved = true;
      return true;
    }

    if (!this.confirmEndSession()) {
      return false;
    }

    this.endSession(session);
    this.approved = true;
    return true;
  }
}
