# Startup UI English Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the user-visible startup loading and failure UI consistently English.

**Architecture:** Update only static splash copy and the Electron failure-dialog
adapter. Preserve the dependency-injected startup orchestration, including CSV
import compatibility and all existing lifecycle behavior.

**Tech Stack:** Electron 42, TypeScript 6, Vite 8, Vitest 4.

---

### Task 1: Translate startup UI copy

**Files:**
- Modify: `public/splash.html`
- Modify: `src/main/index.ts:15-21`
- Modify: `src/__tests__/startup.test.ts`

**Step 1: Write the failing test**

Add a testable, narrow startup-failure presentation boundary if one is not
already exposed. Use injected `report`, `showErrorBox`, and `exit` functions to
assert the failure UI copy:

```ts
expect(showErrorBox).toHaveBeenCalledWith(
  'AutoRally Failed to Start',
  'AutoRally could not start. Please restart the application and try again.',
);
```

Add a source-level assertion that `public/splash.html` contains
`Preparing AutoRally...` and does not contain its prior Chinese loading text.

**Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- src/__tests__/startup.test.ts
```

Expected: FAIL because the current copy is Chinese.

**Step 3: Implement the minimal copy changes**

Update the splash paragraph:

```html
<p>Preparing AutoRally...</p>
```

Update the Electron failure-dialog adapter in `src/main/index.ts`:

```ts
dialog.showErrorBox(
  'AutoRally Failed to Start',
  'AutoRally could not start. Please restart the application and try again.',
);
```

Do not change the `console.error`, exit behavior, lifecycle sequencing, or
Chinese CSV import-header support in `src/main/ipc.ts`.

**Step 4: Run focused verification**

Run:

```bash
npm test -- src/__tests__/startup.test.ts
npm run typecheck
npm run build
```

Expected: PASS, with `dist/renderer/splash.html` containing the English
loading copy.

**Step 5: Commit**

```bash
git add public/splash.html src/main/index.ts src/__tests__/startup.test.ts
git commit -m "fix: use English startup UI copy"
```

### Task 2: Verify startup UI packaging

**Files:**
- Verify: `dist/renderer/splash.html`
- Verify: `dist/main/index.js`

**Step 1: Build the production application**

Run:

```bash
npm run build
```

Expected: PASS.

**Step 2: Inspect packaged copy**

Run:

```bash
rg 'Preparing AutoRally\\.\\.\\.' dist/renderer/splash.html
! rg '正在准备应用' dist/renderer/splash.html
```

Expected: the English string is present and the Chinese loading string is
absent.

**Step 3: Run full regression suite**

Run:

```bash
npm test
```

Expected: PASS.

**Step 4: Commit any verification-driven correction**

If verification reveals a translation or packaging issue, add only its
affected files and commit with a focused `fix:` message.
