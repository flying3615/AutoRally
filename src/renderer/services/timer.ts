export type TimerCallback = (remaining: number, phase: 'running' | 'warning' | 'ended' | 'paused') => void;

type TimerEntry = {
  endTime: number;
  warningTime: number;
  interval: ReturnType<typeof setInterval>;
  paused: boolean;
  remainingAtPause: number;
};

export class GameTimer {
  private timers: Map<number, TimerEntry> = new Map();
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
    const warningTime = endTime - 60 * 1000;

    this.callbacks.set(courtNumber, callback);

    const tick = () => {
      const current = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - current) / 1000));

      if (current >= warningTime && current < endTime) {
        if (!this.warned.has(courtNumber)) {
          this.warningBell.play().catch(() => {});
          this.warned.add(courtNumber);
        }
        callback(remaining, 'warning');
      } else if (current >= endTime) {
        this.endBell.play().catch(() => {});
        callback(0, 'ended');
        this.stop(courtNumber);
      } else {
        callback(remaining, 'running');
      }
    };

    const interval = setInterval(tick, 1000);
    this.timers.set(courtNumber, { endTime, warningTime, interval, paused: false, remainingAtPause: 0 });
    callback(durationMinutes * 60, 'running');
  }

  pause(courtNumber: number) {
    const timer = this.timers.get(courtNumber);
    if (!timer || timer.paused) return;

    clearInterval(timer.interval);
    timer.paused = true;
    timer.remainingAtPause = Math.max(0, Math.ceil((timer.endTime - Date.now()) / 1000));

    const cb = this.callbacks.get(courtNumber);
    if (cb) cb(timer.remainingAtPause, 'paused');
  }

  resume(courtNumber: number) {
    const timer = this.timers.get(courtNumber);
    if (!timer || !timer.paused) return;

    const now = Date.now();
    timer.endTime = now + timer.remainingAtPause * 1000;
    timer.warningTime = timer.endTime - 60 * 1000;
    timer.paused = false;

    const cb = this.callbacks.get(courtNumber);
    if (!cb) return;

    const tick = () => {
      const current = Date.now();
      const remaining = Math.max(0, Math.ceil((timer.endTime - current) / 1000));

      if (current >= timer.warningTime && current < timer.endTime) {
        if (!this.warned.has(courtNumber)) {
          this.warningBell.play().catch(() => {});
          this.warned.add(courtNumber);
        }
        cb(remaining, 'warning');
      } else if (current >= timer.endTime) {
        this.endBell.play().catch(() => {});
        cb(0, 'ended');
        this.stop(courtNumber);
      } else {
        cb(remaining, 'running');
      }
    };

    timer.interval = setInterval(tick, 1000);
    cb(timer.remainingAtPause, 'running');
  }

  isPaused(courtNumber: number): boolean {
    return this.timers.get(courtNumber)?.paused ?? false;
  }

  getRemaining(courtNumber: number): number {
    const timer = this.timers.get(courtNumber);
    if (!timer) return 0;
    if (timer.paused) return timer.remainingAtPause;
    return Math.max(0, Math.ceil((timer.endTime - Date.now()) / 1000));
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
}
