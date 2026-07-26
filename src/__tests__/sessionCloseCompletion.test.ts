import { describe, expect, it } from 'vitest';
import { completeSessionForClose } from '../main/sessionCloseCompletion';

describe('completeSessionForClose', () => {
  const session = { id: 'session-1', startTime: '2026-07-26T08:00:00.000Z' };

  it('marks the session completed before persisting without restoring it', () => {
    const calls: string[] = [];

    completeSessionForClose(session, {
      markCompleted: selected => {
        expect(selected).toBe(session);
        calls.push('mark');
      },
      persist: () => calls.push('persist'),
      restoreActive: () => calls.push('restore'),
    });

    expect(calls).toEqual(['mark', 'persist']);
  });

  it('restores the session to active and rethrows the original persistence error', () => {
    const persistenceError = new Error('save failed');
    let state: 'active' | 'completed' = 'active';
    let thrownError: unknown;

    try {
      completeSessionForClose(session, {
        markCompleted: () => { state = 'completed'; },
        persist: () => { throw persistenceError; },
        restoreActive: selected => {
          expect(selected).toBe(session);
          expect(state).toBe('completed');
          state = 'active';
        },
      });
    } catch (error) {
      thrownError = error;
    }

    expect(state).toBe('active');
    expect(thrownError).toBe(persistenceError);
  });

  it('preserves persistence and restoration errors when restoring fails', () => {
    const persistenceError = new Error('save failed');
    const restorationError = new Error('restore failed');
    let thrownError: unknown;

    try {
      completeSessionForClose(session, {
        markCompleted: () => undefined,
        persist: () => { throw persistenceError; },
        restoreActive: () => { throw restorationError; },
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toMatchObject({
      persistenceError,
      restorationError,
    });
  });
});
