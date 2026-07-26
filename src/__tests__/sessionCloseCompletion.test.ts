import { describe, expect, it } from 'vitest';
import {
  completeSessionsForClose,
  createSessionCloseCompletionDependencies,
} from '../main/sessionCloseCompletion';

describe('completeSessionsForClose', () => {
  const sessions = [
    { id: 'session-1', startTime: '2026-07-26T08:00:00.000Z' },
    { id: 'session-2', startTime: '2026-07-26T09:00:00.000Z' },
  ];

  it('marks every session completed before persisting once without restoring', () => {
    const calls: string[] = [];

    completeSessionsForClose(sessions, {
      markCompleted: selected => {
        calls.push(`mark:${selected.id}`);
      },
      persist: () => calls.push('persist'),
      restoreActive: () => calls.push('restore'),
    });

    expect(calls).toEqual(['mark:session-1', 'mark:session-2', 'persist']);
  });

  it('does not schedule another save when restoring every session after persistence fails', () => {
    const persistenceError = new Error('save failed');
    const autosaveWrites: string[] = [];
    const recoveryWrites: string[] = [];
    const dependencies = createSessionCloseCompletionDependencies({
      run: sql => {
        autosaveWrites.push(sql);
      },
      runWithoutAutosave: sql => {
        recoveryWrites.push(sql);
      },
      saveDb: () => {
        throw persistenceError;
      },
      now: () => '2026-07-26T10:00:00.000Z',
    });

    expect(() => completeSessionsForClose(sessions, dependencies)).toThrow(persistenceError);
    expect(autosaveWrites).toEqual([
      "UPDATE sessions SET endTime = ?, status = 'completed' WHERE id = ?",
      "UPDATE sessions SET endTime = ?, status = 'completed' WHERE id = ?",
    ]);
    expect(recoveryWrites).toEqual([
      "UPDATE sessions SET endTime = NULL, status = 'active' WHERE id = ?",
      "UPDATE sessions SET endTime = NULL, status = 'active' WHERE id = ?",
    ]);
  });

  it('restores every session to active and rethrows the original persistence error', () => {
    const persistenceError = new Error('save failed');
    const state = new Map(sessions.map(session => [session.id, 'active']));
    let thrownError: unknown;

    try {
      completeSessionsForClose(sessions, {
        markCompleted: selected => { state.set(selected.id, 'completed'); },
        persist: () => { throw persistenceError; },
        restoreActive: selected => {
          expect(state.get(selected.id)).toBe('completed');
          state.set(selected.id, 'active');
        },
      });
    } catch (error) {
      thrownError = error;
    }

    expect([...state.values()]).toEqual(['active', 'active']);
    expect(thrownError).toBe(persistenceError);
  });

  it('restores sessions already completed when marking a later session fails', () => {
    const markingError = new Error('second session update failed');
    const state = new Map(sessions.map(session => [session.id, 'active']));
    const calls: string[] = [];

    expect(() => completeSessionsForClose(sessions, {
      markCompleted: selected => {
        calls.push(`mark:${selected.id}`);
        if (selected.id === 'session-2') throw markingError;
        state.set(selected.id, 'completed');
      },
      persist: () => calls.push('persist'),
      restoreActive: selected => {
        calls.push(`restore:${selected.id}`);
        state.set(selected.id, 'active');
      },
    })).toThrow(markingError);

    expect(calls).toEqual(['mark:session-1', 'mark:session-2', 'restore:session-1']);
    expect([...state.values()]).toEqual(['active', 'active']);
  });

  it('attempts to restore every completed session when a restoration fails', () => {
    const persistenceError = new Error('save failed');
    const restorationError = new Error('restore failed');
    const restorationCalls: string[] = [];
    let thrownError: unknown;

    try {
      completeSessionsForClose(sessions, {
        markCompleted: () => undefined,
        persist: () => { throw persistenceError; },
        restoreActive: selected => {
          restorationCalls.push(selected.id);
          if (selected.id === 'session-1') throw restorationError;
        },
      });
    } catch (error) {
      thrownError = error;
    }

    expect(restorationCalls).toEqual(['session-1', 'session-2']);
    expect(thrownError).toMatchObject({
      completionError: persistenceError,
      restorationError,
    });
  });
});
