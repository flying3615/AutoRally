# Session close protection implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent AutoRally from closing while an active session is open unless
the user explicitly chooses to end that session.

**Architecture:** Add a small, dependency-injected main-process close guard that
decides whether a native close event may proceed. Wire the guard into
`BrowserWindow`'s `close` event, with database callbacks that use the existing
session query and `safeSessionEndTime` update semantics.

**Tech Stack:** Electron 42, TypeScript, Vitest, sql.js-backed persistence.

---

### Task 1: Create and test the close-decision guard

**Files:**
- Create: `src/main/sessionCloseGuard.ts`
- Create: `src/__tests__/sessionCloseGuard.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/sessionCloseGuard.test.ts` with tests that inject a fake
active-session lookup, confirmation callback, and session-ending callback:

```ts
import { describe, expect, it, vi } from 'vitest';
import { SessionCloseGuard } from '../main/sessionCloseGuard';

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
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- sessionCloseGuard.test.ts`

Expected: FAIL because `../main/sessionCloseGuard` does not exist.

**Step 3: Write minimal implementation**

Create `src/main/sessionCloseGuard.ts`:

```ts
export interface ActiveSessionForClose {
  id: string;
  startTime: string | null;
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

    if (!this.confirmEndSession()) return false;

    this.endSession(session);
    this.approved = true;
    return true;
  }
}
```

The close-event adapter catches errors from `endSession`: it leaves the close
blocked and reports the failure through a native error dialog rather than
allowing Electron to treat it as an uncaught main-process exception.

**Step 4: Run test to verify it passes**

Run: `npm test -- sessionCloseGuard.test.ts`

Expected: PASS with five passing tests.

**Step 5: Commit**

```bash
git add src/main/sessionCloseGuard.ts src/__tests__/sessionCloseGuard.test.ts
git commit -m "feat: add session close guard"
```

### Task 2: Guard Electron window close events

**Files:**
- Modify: `src/main/index.ts:1-51`

**Step 1: Wire the guard into the main process**

In `src/main/index.ts`:

1. Import `dialog` from `electron`, `queryOne` and `run` from `./database`,
   `safeSessionEndTime` from `./sessionDuration`, and `SessionCloseGuard` from
   `./sessionCloseGuard`.
2. In `createWindow`, create a guard whose callbacks:
   - query `SELECT id, startTime FROM sessions WHERE status = 'active'`;
   - use `dialog.showMessageBoxSync(mainWindow!, { type: 'warning', buttons:
     ['取消关闭', '结束并关闭'], defaultId: 0, cancelId: 0, message:
     '当前 session 正在进行中', detail: '结束 session 后将关闭程序。' })` and return
     true only when button index `1` is chosen;
   - update the selected session with the existing
     `safeSessionEndTime(session.startTime, new Date().toISOString())` and
     `status = 'completed'`.
3. Register `mainWindow.on('close', event => { if (!guard.canClose())
   event.preventDefault(); })` before its existing `closed` listener.

Do not add renderer IPC or change `preload.ts`: Electron's native close event
already covers title-bar close, application quit, and the existing `app:quit`
IPC route.

**Step 2: Run focused verification**

Run: `npm test -- sessionCloseGuard.test.ts && npm run typecheck`

Expected: the close-guard tests pass and TypeScript reports no errors. The
window event handler is intentionally covered by this type check, while the
decision logic remains unit-tested without booting Electron.

**Step 3: Run regression verification**

Run: `npm test`

Expected: all existing Vitest tests pass.

**Step 4: Commit**

```bash
git add src/main/index.ts src/main/sessionCloseGuard.ts src/__tests__/sessionCloseGuard.test.ts
git commit -m "feat: protect active sessions on app close"
```
