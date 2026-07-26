export interface ActiveSessionForClose {
  id: string;
  startTime: string | null;
}

export function handleSessionCloseEvent(
  guard: Pick<SessionCloseGuard, 'canClose'>,
  event: { preventDefault(): void },
): void {
  try {
    if (!guard.canClose()) event.preventDefault();
  } catch (error) {
    event.preventDefault();
    throw error;
  }
}

export class SessionCloseGuard {
  private approved = false;
  private pendingSession: ActiveSessionForClose | undefined;

  constructor(
    private readonly getActiveSession: () => ActiveSessionForClose | undefined,
    private readonly confirmEndSession: () => boolean,
    private readonly endSession: (session: ActiveSessionForClose) => void,
  ) {}

  canClose(): boolean {
    if (this.approved) return true;

    const session = this.pendingSession ?? this.getActiveSession();
    if (!session) {
      this.approved = true;
      return true;
    }

    if (!this.confirmEndSession()) {
      this.pendingSession = undefined;
      return false;
    }

    this.pendingSession = session;
    this.endSession(session);
    this.pendingSession = undefined;
    this.approved = true;
    return true;
  }
}
