export type TimerCallback = (remaining: number, phase: 'running' | 'warning' | 'ended') => void;

export class GameTimer {
  private timers: Map<number, { endTime: number; warningTime: number; interval: ReturnType<typeof setInterval> }> = new Map();
  private callbacks: Map<number, TimerCallback> = new Map();
  private warningBell: HTMLAudioElement;
  private endBell: HTMLAudioElement;

  constructor() {
    this.warningBell = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkZeWkYh/fHJ2lJ6gpKafoKCdm5aHhYOAe3V1dXd7hIeMj5CTkI+OiIeFg4CBfX19fn+AgYOFiIuNjpCRkJCPjoiHhoWDgYB/fX19fn+AgYOFiIuNjpCRkJCPjoiHhoWDgYB/');
    this.endBell = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkZeWkYh/fHJ2lJ6gpKafoKCdm5aHhYOAe3V1dXd7hIeMj5CTkI+OiIeFg4CBfX19fn+AgYOFiIuNjpCRkJCPjoiHhoWDgYB/fX19fn+AgYOFiIuNjpCRkJCPjoiHhoWDgYB/');
  }

  start(courtNumber: number, durationMinutes: number, callback: TimerCallback) {
    this.stop(courtNumber);

    const now = Date.now();
    const endTime = now + durationMinutes * 60 * 1000;
    const warningTime = endTime - 60 * 1000; // 1 minute before end

    this.callbacks.set(courtNumber, callback);

    const interval = setInterval(() => {
      const current = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - current) / 1000));

      if (current >= warningTime && current < endTime) {
        if (!this.hasWarned(courtNumber)) {
          this.warningBell.play().catch(() => {});
          this.markWarned(courtNumber);
        }
        callback(remaining, 'warning');
      } else if (current >= endTime) {
        this.endBell.play().catch(() => {});
        callback(0, 'ended');
        this.stop(courtNumber);
      } else {
        callback(remaining, 'running');
      }
    }, 1000);

    this.timers.set(courtNumber, { endTime, warningTime, interval });
    callback(durationMinutes * 60, 'running');
  }

  stop(courtNumber: number) {
    const timer = this.timers.get(courtNumber);
    if (timer) {
      clearInterval(timer.interval);
      this.timers.delete(courtNumber);
    }
    this.callbacks.delete(courtNumber);
    this.warned.delete(courtNumber);
  }

  stopAll() {
    for (const court of this.timers.keys()) {
      this.stop(court);
    }
  }

  private warned = new Set<number>();

  private hasWarned(court: number): boolean {
    return this.warned.has(court);
  }

  private markWarned(court: number) {
    this.warned.add(court);
  }
}
