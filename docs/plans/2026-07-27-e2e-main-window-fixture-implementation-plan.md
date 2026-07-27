# E2E Main Window Fixture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Electron E2E tests consistently operate on the main renderer window
rather than the transient startup splash window.

**Architecture:** The shared Playwright `page` fixture will identify the renderer
by its built `index.html` URL. It will first reuse a matching existing window,
then wait for a matching Electron `window` event if startup is still in progress.
The existing renderer readiness condition remains the final guard.

**Tech Stack:** Electron 42, Playwright 1.59, TypeScript, Vitest/Playwright.

---

### Task 1: Reproduce the fixture regression

**Files:**
- Test: `e2e/checkin.spec.ts:4-13`
- Inspect: `e2e/helpers.ts:58-66`

**Step 1: Run the existing failing regression test**

Run:

```bash
npx playwright test e2e/checkin.spec.ts -g "shows checked-in player in waiting pool"
```

Expected: FAIL at `e2e/helpers.ts` because `app.firstWindow()` selects the splash
window and it closes before the readiness predicate can succeed.

**Step 2: Commit**

Do not commit; this task establishes the pre-existing failure.

### Task 2: Select the main Electron window

**Files:**
- Modify: `e2e/helpers.ts:12-66`
- Test: `e2e/checkin.spec.ts:4-13`

**Step 1: Add the failing window-selection expectation**

Treat the targeted check-in test from Task 1 as the regression test. It already
requires the fixture to expose a live main renderer page; no product behavior or
new E2E spec is needed.

**Step 2: Implement the smallest shared fixture change**

Add a helper that:

1. defines the built main renderer URL suffix as `dist/renderer/index.html`;
2. scans `app.windows()` for a non-closed page whose URL matches that suffix;
3. if unavailable, waits for a future `window` event with the same predicate;
4. returns that page for the existing readiness wait.

Keep the splash window and all production startup code unchanged. Do not use a
fixed delay or wait for the splash to close.

**Step 3: Run the targeted regression test**

Run:

```bash
npx playwright test e2e/checkin.spec.ts -g "shows checked-in player in waiting pool"
```

Expected: PASS.

**Step 4: Commit**

```bash
git add e2e/helpers.ts
git commit -m "fix: select main window in E2E fixture"
```

### Task 3: Verify the complete E2E suite

**Files:**
- Verify: `e2e/**/*.spec.ts`

**Step 1: Run the complete suite**

Run:

```bash
npm run test:e2e
```

Expected: the main-process build, Vite build, and all Playwright tests pass.

**Step 2: Inspect repository state**

Run:

```bash
git status --short
```

Expected: only the pre-existing local files and Playwright result artifacts are
present; no unintended production-code changes are introduced.
