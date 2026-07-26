import { describe, expect, it, vi } from 'vitest';
import {
  handleSessionCloseEvent,
  SessionCloseGuard,
  type ActiveSessionForClose,
} from '../main/sessionCloseGuard';

describe('SessionCloseGuard', () => {
  it('allows closing immediately when there is no active session', () => {
    const confirm = vi.fn();
    const endSession = vi.fn();
    const guard = new SessionCloseGuard(() => undefined, confirm, endSession);

    expect(guard.canClose()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(endSession).not.toHaveBeenCalled();
  });

  it('keeps the app open when the user cancels', () => {
    const active = { id: 'session-1', startTime: '2026-07-26T08:00:00.000Z' };
    const endSession = vi.fn();
    const guard = new SessionCloseGuard(() => active, () => false, endSession);

    expect(guard.canClose()).toBe(false);
    expect(endSession).not.toHaveBeenCalled();
  });

  it('ends the active session and permits closing after confirmation', () => {
    const active = { id: 'session-1', startTime: '2026-07-26T08:00:00.000Z' };
    const endSession = vi.fn();
    const guard = new SessionCloseGuard(() => active, () => true, endSession);

    expect(guard.canClose()).toBe(true);
    expect(endSession).toHaveBeenCalledWith(active);
  });

  it('does not prompt or end a session again for the follow-up close event', () => {
    const active = { id: 'session-1', startTime: '2026-07-26T08:00:00.000Z' };
    const confirm = vi.fn(() => true);
    const endSession = vi.fn();
    const guard = new SessionCloseGuard(() => active, confirm, endSession);

    guard.canClose();
    expect(guard.canClose()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it('does not approve closing when ending the session fails', () => {
    const active = { id: 'session-1', startTime: '2026-07-26T08:00:00.000Z' };
    const endSession = vi.fn(() => { throw new Error('write failed'); });
    const guard = new SessionCloseGuard(() => active, () => true, endSession);

    expect(() => guard.canClose()).toThrow('write failed');
    expect(() => guard.canClose()).toThrow('write failed');
    expect(endSession).toHaveBeenCalledTimes(2);
  });

  it('re-queries the active session after an ending failure', () => {
    const failed: ActiveSessionForClose = {
      id: 'session-1',
      startTime: '2026-07-26T08:00:00.000Z',
    };
    const fresh: ActiveSessionForClose = {
      id: 'session-2',
      startTime: '2026-07-26T09:00:00.000Z',
    };
    const getActiveSession = vi.fn()
      .mockReturnValueOnce(failed)
      .mockReturnValueOnce(fresh);
    const persistenceError = new Error('save failed');
    const endSession = vi.fn((session: ActiveSessionForClose) => {
      if (session === failed) throw persistenceError;
    });
    const guard = new SessionCloseGuard(getActiveSession, () => true, endSession);

    expect(() => guard.canClose()).toThrow(persistenceError);
    expect(guard.canClose()).toBe(true);
    expect(getActiveSession).toHaveBeenCalledTimes(2);
    expect(endSession).toHaveBeenNthCalledWith(1, failed);
    expect(endSession).toHaveBeenNthCalledWith(2, fresh);
  });

  it('prevents the close event and rethrows when ending a confirmed active session fails', () => {
    const active = { id: 'session-1', startTime: '2026-07-26T08:00:00.000Z' };
    const writeError = new Error('write failed');
    const guard = new SessionCloseGuard(
      () => active,
      () => true,
      () => { throw writeError; },
    );
    const preventDefault = vi.fn();
    const event = { preventDefault };

    let thrownError: unknown;
    try {
      handleSessionCloseEvent(guard, event);
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBe(writeError);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});
