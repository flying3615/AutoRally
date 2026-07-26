import { describe, expect, it, vi } from 'vitest';
import {
  handleSessionCloseEvent,
  SessionCloseGuard,
  type ActiveSessionForClose,
} from '../main/sessionCloseGuard';

describe('SessionCloseGuard', () => {
  it('allows closing immediately when there is no active session', () => {
    const confirm = vi.fn();
    const endSessions = vi.fn();
    const guard = new SessionCloseGuard(() => [], confirm, endSessions);

    expect(guard.canClose()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(endSessions).not.toHaveBeenCalled();
  });

  it('keeps the app open when the user cancels', () => {
    const active = { id: 'session-1', startTime: '2026-07-26T08:00:00.000Z' };
    const endSessions = vi.fn();
    const guard = new SessionCloseGuard(() => [active], () => false, endSessions);

    expect(guard.canClose()).toBe(false);
    expect(endSessions).not.toHaveBeenCalled();
  });

  it('ends the active session and permits closing after confirmation', () => {
    const active = { id: 'session-1', startTime: '2026-07-26T08:00:00.000Z' };
    const endSessions = vi.fn();
    const guard = new SessionCloseGuard(() => [active], () => true, endSessions);

    expect(guard.canClose()).toBe(true);
    expect(endSessions).toHaveBeenCalledWith([active]);
  });

  it('checks for a newly active session after an earlier close found none', () => {
    const active = { id: 'session-1', startTime: '2026-07-26T08:00:00.000Z' };
    let activeSessions: ActiveSessionForClose[] = [];
    const confirm = vi.fn(() => true);
    const endSessions = vi.fn();
    const guard = new SessionCloseGuard(() => activeSessions, confirm, endSessions);

    expect(guard.canClose()).toBe(true);

    activeSessions = [active];

    expect(guard.canClose()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(endSessions).toHaveBeenCalledWith([active]);
  });

  it('does not prompt or end a session again for the follow-up close event', () => {
    const active = { id: 'session-1', startTime: '2026-07-26T08:00:00.000Z' };
    const confirm = vi.fn(() => true);
    const endSessions = vi.fn();
    const guard = new SessionCloseGuard(() => [active], confirm, endSessions);

    guard.canClose();
    expect(guard.canClose()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(endSessions).toHaveBeenCalledTimes(1);
  });

  it('does not approve closing when ending the session fails', () => {
    const active = { id: 'session-1', startTime: '2026-07-26T08:00:00.000Z' };
    const endSessions = vi.fn(() => { throw new Error('write failed'); });
    const guard = new SessionCloseGuard(() => [active], () => true, endSessions);

    expect(() => guard.canClose()).toThrow('write failed');
    expect(() => guard.canClose()).toThrow('write failed');
    expect(endSessions).toHaveBeenCalledTimes(2);
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
    const getActiveSessions = vi.fn()
      .mockReturnValueOnce([failed])
      .mockReturnValueOnce([fresh]);
    const persistenceError = new Error('save failed');
    const endSessions = vi.fn((sessions: ActiveSessionForClose[]) => {
      if (sessions[0] === failed) throw persistenceError;
    });
    const guard = new SessionCloseGuard(getActiveSessions, () => true, endSessions);

    expect(() => guard.canClose()).toThrow(persistenceError);
    expect(guard.canClose()).toBe(true);
    expect(getActiveSessions).toHaveBeenCalledTimes(2);
    expect(endSessions).toHaveBeenNthCalledWith(1, [failed]);
    expect(endSessions).toHaveBeenNthCalledWith(2, [fresh]);
  });

  it('prevents the close event and reports without throwing when ending a confirmed active session fails', () => {
    const active = { id: 'session-1', startTime: '2026-07-26T08:00:00.000Z' };
    const writeError = new Error('write failed');
    const guard = new SessionCloseGuard(
      () => [active],
      () => true,
      () => { throw writeError; },
    );
    const preventDefault = vi.fn();
    const event = { preventDefault };
    const reportError = vi.fn();

    expect(() => handleSessionCloseEvent(guard, event, reportError)).not.toThrow();
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(writeError);
  });

  it('prevents closing and logs when the error reporter throws', () => {
    const guardError = new Error('write failed');
    const reporterError = new Error('dialog failed');
    const preventDefault = vi.fn();
    const reportError = vi.fn(() => { throw reporterError; });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      expect(() => handleSessionCloseEvent(
        { canClose: () => { throw guardError; } },
        { preventDefault },
        reportError,
      )).not.toThrow();
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(guardError);
      expect(consoleError).toHaveBeenCalledWith('Failed to report session close error:', reporterError);
    } finally {
      consoleError.mockRestore();
    }
  });
});
