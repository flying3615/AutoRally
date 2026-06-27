# Deferred Payment Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow players to check in without paying immediately; the operator settles the debt later via the Payments page.

**Architecture:** Add `'defer'` as a third payment method to the existing `attendance:checkin` IPC handler (writes `status: 'unpaid'`). Scope `payments:listUnpaid` to an optional `sessionId`. In Checkin.tsx, load the unpaid ID set per session and render a distinct orange IOU card for deferred players, plus a context menu item to trigger deferral.

**Tech Stack:** Electron IPC (better-sqlite3), React, TypeScript, Tailwind CSS

---

### Task 1: Backend — support `'defer'` in `attendance:checkin`

**Files:**
- Modify: `src/main/ipc.ts` (around line 167)

- [ ] **Step 1: Update the handler to accept `'defer'`**

Replace the handler signature and add the defer branch in `src/main/ipc.ts`:

```ts
// line ~167 — change paymentMethod type and add else-if branch
ipcMain.handle('attendance:checkin', (_e, playerId: string, sessionId: string, paymentMethod: 'credit' | 'cash' | 'defer') => {
  const id = uuid();
  const checkinTime = new Date().toISOString();
  const fee = queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'sessionFee'");
  const sessionFee = Number(fee?.value ?? 10);

  return transaction(() => {
    try {
      run('INSERT INTO attendance (id, playerId, sessionId, checkinTime) VALUES (?, ?, ?, ?)',
        [id, playerId, sessionId, checkinTime]);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE')) return null;
      throw err;
    }

    if (paymentMethod === 'credit') {
      const balance = queryOne<{ balance: number }>('SELECT balance FROM balances WHERE playerId = ?', [playerId]);
      if (!balance || balance.balance < sessionFee) {
        throw new Error('Insufficient balance');
      }
      run('UPDATE balances SET balance = balance - ?, lastUpdated = ? WHERE playerId = ?',
        [sessionFee, checkinTime, playerId]);
      run('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType, paymentMethod) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid(), playerId, sessionId, sessionFee, 'paid', checkinTime, 'session', 'credit']);
    } else if (paymentMethod === 'defer') {
      run('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType, paymentMethod) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid(), playerId, sessionId, sessionFee, 'unpaid', checkinTime, 'session', 'cash']);
    } else {
      run('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType, paymentMethod) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid(), playerId, sessionId, sessionFee, 'paid', checkinTime, 'session', 'cash']);
    }
    return { id, playerId, sessionId, checkinTime };
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat(backend): support defer payment method in attendance checkin"
```

---

### Task 2: Backend — scope `payments:listUnpaid` to optional sessionId

**Files:**
- Modify: `src/main/ipc.ts` (around line 299)

- [ ] **Step 1: Update the handler**

```ts
// replace the existing payments:listUnpaid handler
ipcMain.handle('payments:listUnpaid', (_e, sessionId?: string) => {
  if (sessionId) {
    return queryAll(
      "SELECT py.*, p.name as playerName, p.phone FROM payments py JOIN players p ON py.playerId = p.id WHERE py.status = 'unpaid' AND py.paymentType = 'session' AND py.sessionId = ? ORDER BY py.paidDate DESC",
      [sessionId]
    );
  }
  return queryAll(
    "SELECT py.*, p.name as playerName, p.phone FROM payments py JOIN players p ON py.playerId = p.id WHERE py.status = 'unpaid' AND py.paymentType = 'session' ORDER BY py.paidDate DESC"
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat(backend): scope paymentsListUnpaid to optional sessionId"
```

---

### Task 3: Preload — update API type signatures

**Files:**
- Modify: `src/main/preload.ts`

- [ ] **Step 1: Update both signatures**

Find and update these two lines in `src/main/preload.ts`:

```ts
// change attendanceCheckin to accept 'defer'
attendanceCheckin: (playerId: string, sessionId: string, paymentMethod: 'credit' | 'cash' | 'defer') =>
  ipcRenderer.invoke('attendance:checkin', playerId, sessionId, paymentMethod),

// change paymentsListUnpaid to accept optional sessionId
paymentsListUnpaid: (sessionId?: string) => ipcRenderer.invoke('payments:listUnpaid', sessionId),
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: no output (clean compile).

- [ ] **Step 3: Commit**

```bash
git add src/main/preload.ts
git commit -m "feat(preload): update API signatures for defer checkin and scoped listUnpaid"
```

---

### Task 4: Checkin page — wire up deferred check-in

**Files:**
- Modify: `src/renderer/pages/Checkin.tsx`

- [ ] **Step 1: Add `unpaidIds` state and load it in `load()`**

In the `Checkin` component, add state and fetch alongside existing data:

```ts
// add after line ~413 (existing state declarations)
const [unpaidIds, setUnpaidIds] = useState<Set<string>>(new Set());
```

In the `load()` function, add `paymentsListUnpaid(sessionId)` to the `Promise.all`:

```ts
const load = async () => {
  if (!sessionId) return;
  const [allPlayers, attendList, gameList, settings, sessionList, unpaidList] = await Promise.all([
    window.api.playersList(),
    window.api.attendanceListBySession(sessionId),
    window.api.gamesListBySession(sessionId),
    window.api.settingsGetAll() as Promise<Record<string, string>>,
    window.api.sessionsList(),
    window.api.paymentsListUnpaid(sessionId),
  ]);
  // ... existing code unchanged ...
  setUnpaidIds(new Set((unpaidList as { playerId: string }[]).map(p => p.playerId)));
};
```

- [ ] **Step 2: Update `doCheckin` to accept `'defer'`**

```ts
const doCheckin = async (playerId: string, method: 'credit' | 'cash' | 'defer') => {
  if (!sessionId) return;
  try {
    await window.api.attendanceCheckin(playerId, sessionId, method);
    setCheckedInSet(prev => new Set(prev).add(playerId));
    load();
  } catch (err: any) {
    alert(err?.message ?? 'Check-in failed');
  }
};
```

- [ ] **Step 3: Add "Check In — Pay Later" to the context menu**

Find the `ContextMenu` component (around line 40). Add a new prop `onDefer` and a menu item between Edit and Delete:

```tsx
// Update ContextMenu props interface:
function ContextMenu({
  x, y, player, onClose, onEdit, onDelete, onDefer, isCheckedIn,
}: {
  x: number; y: number; player: PlayerInfo;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDefer: () => void;
  isCheckedIn: boolean;
}) {
```

Add the new button inside the menu, after the Edit button and before Delete, only shown when not yet checked in:

```tsx
{!isCheckedIn && (
  <button
    onClick={onDefer}
    className="w-full text-left px-3 py-2 text-sm text-orange-600 hover:bg-orange-50 flex items-center gap-2.5 transition-colors"
  >
    <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    Check In — Pay Later
  </button>
)}
```

- [ ] **Step 4: Update all `ContextMenu` usages to pass `onDefer` and `isCheckedIn`**

Find where `<ContextMenu` is rendered (around line 470) and update:

```tsx
{ctxMenu && (
  <ContextMenu
    x={ctxMenu.x}
    y={ctxMenu.y}
    player={ctxMenu.player}
    onClose={() => setCtxMenu(null)}
    onEdit={() => { setEditingPlayer(ctxMenu.player); setCtxMenu(null); }}
    onDelete={() => { handleDelete(ctxMenu.player); setCtxMenu(null); }}
    onDefer={() => { doCheckin(ctxMenu.player.id, 'defer'); setCtxMenu(null); }}
    isCheckedIn={checkedInSet.has(ctxMenu.player.id)}
  />
)}
```

- [ ] **Step 5: Render IOU card style for deferred players**

In `renderCard`, update the checked-in branch to detect unpaid players and apply orange styling:

```tsx
if (checked) {
  const isIOU = unpaidIds.has(p.id);
  return (
    <button
      key={p.id}
      onClick={() => handleUncheck(p.id)}
      onContextMenu={(e) => handleContextMenu(e, p)}
      className="relative flex items-center rounded-md text-left transition-all active:scale-[0.98] group/check"
      style={{
        padding: '3px 6px',
        backgroundColor: isIOU ? '#fff7ed' : '#ecfdf5',
        borderColor: isIOU ? '#fdba74' : '#a7f3d0',
        borderWidth: 1,
        borderStyle: 'solid',
        boxShadow: isIOU
          ? '0 1px 3px -2px rgba(234,88,12,0.12)'
          : '0 1px 3px -2px rgba(16,185,129,0.12)',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#fee2e2';
        e.currentTarget.style.borderColor = '#fecaca';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isIOU ? '#fff7ed' : '#ecfdf5';
        e.currentTarget.style.borderColor = isIOU ? '#fdba74' : '#a7f3d0';
      }}
    >
      <span className="text-sm font-bold truncate flex-1" style={{ color: isIOU ? '#c2410c' : '#047857' }}>
        {p.name}
        <span className="text-[11px] text-zinc-400 ml-0.5">{p.level}</span>
      </span>
      <span className="shrink-0 ml-0.5 flex items-center gap-1">
        {isIOU && (
          <span className="text-[9px] font-bold px-1 py-px rounded bg-orange-100 text-orange-600 leading-tight">
            IOU
          </span>
        )}
        <svg className="w-3 h-3 text-emerald-500 block group-hover/check:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        <svg className="w-3 h-3 text-red-400 hidden group-hover/check:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    </button>
  );
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/pages/Checkin.tsx
git commit -m "feat(checkin): add deferred payment check-in with IOU card style"
```

---

### Task 5: Verify end-to-end

- [ ] **Step 1: Start the app**

```bash
npm run dev
```

- [ ] **Step 2: Open a session → Checkin page**

Right-click a player who is not yet checked in. Verify the context menu shows "Check In — Pay Later" (orange text, clock icon) alongside Edit and Delete.

- [ ] **Step 3: Click "Check In — Pay Later"**

Verify the player card moves to the checked-in area with an orange border and `IOU` badge. The normal green-bordered players should be unaffected.

- [ ] **Step 4: Navigate to Payments page**

Verify the Unpaid tab shows the deferred player with their session fee, and the stats card shows the correct count and outstanding amount.

- [ ] **Step 5: Click "Mark Paid" on the record**

Verify the record disappears from the Unpaid tab, the stats go back to 0, and — if you return to Checkin — the player's card should now appear green (on next load).

- [ ] **Step 6: Right-click an already-checked-in player**

Verify "Check In — Pay Later" does NOT appear in the context menu.
