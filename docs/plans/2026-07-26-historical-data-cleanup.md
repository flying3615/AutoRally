# Historical Data Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a typed-confirmation settings action that permanently clears historical activity, payment, and completed tournament data without changing the current operating state.

**Architecture:** Put the deletion rules in a pure main-process service that operates on an injected `sql.js` database and owns its transaction. Expose that service through a narrow IPC/preload API, then add a Settings-local destructive dialog whose final action is disabled until the user types `清理`.

**Tech Stack:** Electron IPC, TypeScript, React 19, Zustand, sql.js, Vitest, Playwright.

---

### Task 1: Create and test the transactional cleanup service

**Files:**
- Create: `src/main/historyCleanup.ts`
- Create: `src/__tests__/historyCleanup.test.ts`

**Step 1: Write the failing preservation-and-deletion test**

Create `src/__tests__/historyCleanup.test.ts`. Use `initSqlJs` to create an in-memory database with foreign keys enabled and the tables involved in cleanup: `players`, `balances`, `settings`, `upcoming_sessions`, `sessions`, `attendance`, `games`, `payments`, `tournaments`, `tournament_registrations`, `tournament_standings`, `tournament_teams`, `tournament_team_players`, `tournament_team_matches`, and `tournament_matches`.

Seed:

- One player, balance, setting, and future session.
- One active session and one completed session, each with attendance and a game.
- One payment tied to the active session, one tied to the completed session, and one top-up.
- One active tournament and one completed tournament, with a registration, standing, team, team player, team match, and tournament match for each.

Import the not-yet-created `clearHistoricalData` and assert:

```ts
expect(clearHistoricalData(db)).toEqual({
  payments: 3,
  sessions: 1,
  tournaments: 1,
});

expect(count(db, 'players')).toBe(1);
expect(count(db, 'balances')).toBe(1);
expect(count(db, 'settings')).toBe(1);
expect(count(db, 'upcoming_sessions')).toBe(1);
expect(countWhere(db, 'sessions', "status = 'active'")).toBe(1);
expect(countWhere(db, 'sessions', "status = 'completed'")).toBe(0);
expect(count(db, 'payments')).toBe(0);
expect(countWhere(db, 'tournaments', "status = 'active'")).toBe(1);
expect(countWhere(db, 'tournaments', "status = 'completed'")).toBe(0);
```

Also assert that every dependent table retains only the active tournament's rows and that the completed session's attendance and games are gone.

**Step 2: Run the targeted test to verify it fails**

Run:

```bash
npm test -- src/__tests__/historyCleanup.test.ts
```

Expected: FAIL because `../main/historyCleanup` does not exist.

**Step 3: Implement the minimal transactional service**

Create `src/main/historyCleanup.ts` with:

```ts
import type { Database } from 'sql.js';

export interface HistoricalDataCleanupResult {
  payments: number;
  sessions: number;
  tournaments: number;
}

export function clearHistoricalData(db: Database): HistoricalDataCleanupResult {
  db.run('BEGIN');
  try {
    db.run('DELETE FROM payments');
    const payments = db.getRowsModified();

    db.run("DELETE FROM games WHERE sessionId IN (SELECT id FROM sessions WHERE status = 'completed')");
    db.run("DELETE FROM sessions WHERE status = 'completed'");
    const sessions = db.getRowsModified();

    // Delete completed-tournament dependents before their referenced records.
    db.run("DELETE FROM tournament_matches WHERE tournamentId IN (SELECT id FROM tournaments WHERE status = 'completed')");
    db.run("DELETE FROM tournament_standings WHERE tournamentId IN (SELECT id FROM tournaments WHERE status = 'completed')");
    db.run("DELETE FROM tournament_team_players WHERE teamId IN (SELECT id FROM tournament_teams WHERE tournamentId IN (SELECT id FROM tournaments WHERE status = 'completed'))");
    db.run("DELETE FROM tournament_team_matches WHERE tournamentId IN (SELECT id FROM tournaments WHERE status = 'completed')");
    db.run("DELETE FROM tournament_teams WHERE tournamentId IN (SELECT id FROM tournaments WHERE status = 'completed')");
    db.run("DELETE FROM tournament_registrations WHERE tournamentId IN (SELECT id FROM tournaments WHERE status = 'completed')");
    db.run("DELETE FROM tournaments WHERE status = 'completed'");
    const tournaments = db.getRowsModified();

    db.run('COMMIT');
    return { payments, sessions, tournaments };
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}
```

Keep the service independent of Electron and the global database singleton so it remains directly unit-testable.

**Step 4: Add the failing rollback test**

In `src/__tests__/historyCleanup.test.ts`, create a `BEFORE DELETE ON payments` trigger that raises `ABORT`, call `clearHistoricalData`, and assert it throws. Then assert the completed session, its payment, and the completed tournament still exist.

**Step 5: Run the targeted tests to verify they pass**

Run:

```bash
npm test -- src/__tests__/historyCleanup.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/main/historyCleanup.ts src/__tests__/historyCleanup.test.ts
git commit -m "feat: add transactional history cleanup service"
```

### Task 2: Expose cleanup through a narrow Electron API

**Files:**
- Modify: `src/main/ipc.ts:1-70`
- Modify: `src/main/preload.ts:3-12`
- Modify: `e2e/helpers.ts:48-94`
- Modify: `e2e/dashboard.spec.ts`

**Step 1: Write the failing IPC integration test**

Add a dashboard/settings e2e test that uses public preload methods to:

1. Add a player.
2. Create and end one daily session after checking in that player.
3. Create a separate active session and check in the same player.
4. Call the not-yet-created `window.api.dataClearHistory()`.
5. Assert the returned result reports one removed session and two removed payments, `sessionsList()` has no completed session, `sessionsGetActive()` still returns the active session, `paymentsListBySession(active.id)` is empty, and `playersList()` still contains the player.

**Step 2: Run the targeted e2e test to verify it fails**

Run:

```bash
npm run build:main && npx playwright test e2e/dashboard.spec.ts --grep "clears historical data through the preload API"
```

Expected: FAIL because `window.api.dataClearHistory` is undefined.

**Step 3: Wire the IPC handler and preload API**

In `src/main/ipc.ts`, import `getDb` and `saveDb` from `./database` plus `clearHistoricalData` from `./historyCleanup`. Register one handler next to the existing backup handlers:

```ts
ipcMain.handle('data:clearHistory', () => {
  const result = clearHistoricalData(getDb());
  saveDb();
  return result;
});
```

In `src/main/preload.ts`, add the typed bridge method:

```ts
dataClearHistory: () =>
  ipcRenderer.invoke('data:clearHistory') as Promise<{
    payments: number;
    sessions: number;
    tournaments: number;
  }>,
```

Do not expose an arbitrary query, table name, deletion filter, or confirmation phrase to the renderer. The renderer receives only this fixed operation.

**Step 4: Run the targeted e2e test to verify it passes**

Run:

```bash
npm run build:main && npx playwright test e2e/dashboard.spec.ts --grep "clears historical data through the preload API"
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/ipc.ts src/main/preload.ts e2e/helpers.ts e2e/dashboard.spec.ts
git commit -m "feat: expose historical data cleanup API"
```

### Task 3: Add the typed-confirmation settings interface

**Files:**
- Modify: `src/renderer/pages/Settings.tsx:1-247`
- Modify: `src/renderer/pages/Settings.tsx:381-425`
- Modify: `e2e/dashboard.spec.ts`

**Step 1: Write the failing UI test**

Add an e2e test that navigates to `/settings`, clicks the `Clear Historical Data` button, and asserts:

```ts
await expect(page.getByRole('dialog', { name: 'Clear historical data' })).toBeVisible();
const confirmButton = page.getByRole('button', { name: 'Permanently Clear Data' });
await expect(confirmButton).toBeDisabled();

await page.getByLabel('Type 清理 to confirm').fill('clear');
await expect(confirmButton).toBeDisabled();

await page.getByLabel('Type 清理 to confirm').fill('清理');
await expect(confirmButton).toBeEnabled();
```

Click the final button and assert the dialog closes and a success message contains the returned deletion counts. Add a second test that clicks Cancel and verifies the cleanup API was not invoked by asserting the completed session remains.

**Step 2: Run the targeted UI test to verify it fails**

Run:

```bash
npm run build && npx playwright test e2e/dashboard.spec.ts --grep "requires typed confirmation before clearing historical data"
```

Expected: FAIL because the button and dialog do not exist.

**Step 3: Implement a Settings-local destructive dialog**

In `Settings.tsx`, add state for whether the dialog is open, the typed confirmation text, in-flight status, and an operation message. Add a `HistoricalDataCleanupDialog` component in the same file because this typed destructive workflow is specific to Settings and the shared `ConfirmDialog` only supports fixed buttons.

The dialog must:

- Use `role="dialog"` and `aria-modal="true"`, with an accessible name of `Clear historical data`.
- State that completed daily sessions, all payments/top-ups, and completed tournaments will be deleted, while players, balances, settings, upcoming sessions, active daily sessions, and active/upcoming tournaments remain.
- Include a labeled text input `Type 清理 to confirm`.
- Disable `Permanently Clear Data` unless `confirmationText === '清理'` and no request is in flight.
- Close and reset on Cancel, Escape, and backdrop click without calling the API.
- Call `window.api.dataClearHistory()` only from the enabled final action; show an error message if it rejects, leaving the dialog open.

Add a `Historical Data` danger-zone section immediately after `Data Backup` with an explanation, a `Clear Historical Data` red outline button, and an inline success/error message. On success, reset and close the dialog, show counts returned by the API, and call `refreshUpcoming()` so the Settings page re-syncs its shared data.

**Step 4: Run the targeted UI tests to verify they pass**

Run:

```bash
npm run build && npx playwright test e2e/dashboard.spec.ts --grep "historical data"
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/pages/Settings.tsx e2e/dashboard.spec.ts
git commit -m "feat: add typed historical data cleanup confirmation"
```

### Task 4: Validate the complete change

**Files:**
- Verify only; no source changes expected.

**Step 1: Run focused unit tests**

Run:

```bash
npm test -- src/__tests__/historyCleanup.test.ts src/__tests__/database.test.ts
```

Expected: PASS.

**Step 2: Run all related e2e coverage**

Run:

```bash
npm run build && npx playwright test e2e/dashboard.spec.ts e2e/session.spec.ts e2e/tournament.spec.ts
```

Expected: PASS.

**Step 3: Run type checking**

Run:

```bash
npm run typecheck
```

Expected: PASS with no TypeScript errors.

**Step 4: Inspect the final change**

Run:

```bash
git --no-pager status --short
git --no-pager diff HEAD~3..HEAD --stat
```

Expected: Only the intended cleanup implementation, tests, and previously committed design/plan documentation are present. Preserve the pre-existing `package-lock.json` modification.
