# Startup Splash Screen Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show an immediate branded startup window and enforce a single
AutoRally instance so repeat launches focus the active window.

**Architecture:** Move testable startup state and window-lifecycle coordination
into a main-process module with injected Electron-like dependencies. Keep
Electron integration in `src/main/index.ts`; it acquires the single-instance
lock before readiness, creates the splash window before slow IPC initialization,
and delegates focus and cleanup behavior to the coordinator. A static splash
page is served by Vite in development and copied into the renderer build for
packaged applications.

**Tech Stack:** Electron 42, TypeScript 6, Vite 8, Vitest 4.

---

### Task 1: Add failing startup coordinator tests

**Files:**
- Create: `src/__tests__/startup.test.ts`
- Create: `src/main/startup.ts`

**Step 1: Write the failing test**

Create fakes for a window with `isMinimized`, `restore`, `focus`, `show`, and
`close` methods. Test a coordinator that:

```ts
it('focuses the splash window while startup is in progress', () => {
  const splash = createWindowFake();
  const startup = new StartupCoordinator();
  startup.setSplashWindow(splash);

  startup.focusActiveWindow();

  expect(splash.focus).toHaveBeenCalledOnce();
});

it('restores and focuses the main window after startup', () => {
  const main = createWindowFake({ minimized: true });
  const startup = new StartupCoordinator();
  startup.setMainWindow(main);

  startup.focusActiveWindow();

  expect(main.restore).toHaveBeenCalledOnce();
  expect(main.focus).toHaveBeenCalledOnce();
});

it('shows the main window and closes the splash window when ready', () => {
  const splash = createWindowFake();
  const main = createWindowFake();
  const startup = new StartupCoordinator();
  startup.setSplashWindow(splash);
  startup.setMainWindow(main);

  startup.showMainWindow();

  expect(main.show).toHaveBeenCalledOnce();
  expect(splash.close).toHaveBeenCalledOnce();
});
```

Include cases where no splash or main window exists so cleanup and focus remain
safe.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/startup.test.ts`

Expected: FAIL because `../main/startup` does not exist.

**Step 3: Write minimal implementation**

Create `src/main/startup.ts` with a narrow `AppWindow` interface and
`StartupCoordinator`:

```ts
export interface AppWindow {
  isMinimized(): boolean;
  restore(): void;
  focus(): void;
  show(): void;
  close(): void;
}

export class StartupCoordinator {
  private splashWindow: AppWindow | null = null;
  private mainWindow: AppWindow | null = null;

  setSplashWindow(window: AppWindow | null) { this.splashWindow = window; }
  setMainWindow(window: AppWindow | null) { this.mainWindow = window; }

  focusActiveWindow() {
    const window = this.mainWindow ?? this.splashWindow;
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  }

  showMainWindow() {
    this.mainWindow?.show();
    this.splashWindow?.close();
    this.splashWindow = null;
  }
}
```

Add a `closeSplashWindow` method if needed by the main process so it does not
reach into coordinator state.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/startup.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/startup.ts src/__tests__/startup.test.ts
git commit -m "test: cover startup window coordination"
```

### Task 2: Add the branded static splash page

**Files:**
- Create: `public/splash.html`
- Modify: `vite.config.ts:17-30` only if a `publicDir` override is required

**Step 1: Write the failing build assertion**

Run the existing production build before adding the page and confirm that
`dist/renderer/splash.html` is absent:

```bash
npm run build && test -f dist/renderer/splash.html
```

Expected: the final `test` command exits non-zero.

**Step 2: Add the minimal splash page**

Create `public/splash.html`, which Vite copies verbatim to
`dist/renderer/splash.html`. Use self-contained CSS and no external assets:

```html
<main class="splash" aria-label="AutoRally is starting">
  <div class="mark" aria-hidden="true">AR</div>
  <h1>AutoRally</h1>
  <p>正在准备应用...</p>
  <span class="loader" aria-hidden="true"></span>
</main>
```

Style it with the existing design-system colors: `#f8fafb` background,
`#18181b` text, and `#059669` for the mark and animated loader. Center the
content in a compact fixed viewport; honor `prefers-reduced-motion` by stopping
the spinner animation.

**Step 3: Build to verify the page is packaged**

Run:

```bash
npm run build && test -f dist/renderer/splash.html
```

Expected: PASS.

**Step 4: Commit**

```bash
git add public/splash.html vite.config.ts
git commit -m "feat: add branded startup splash page"
```

### Task 3: Wire Electron startup windows and the single-instance lock

**Files:**
- Modify: `src/main/index.ts:1-122`
- Modify: `src/main/startup.ts` only if Task 1 needs a cleanup method
- Test: `src/__tests__/startup.test.ts`

**Step 1: Extend the failing tests**

Add tests for the main-process adapter behavior that can remain dependency
injected:

```ts
it('closes the splash when the main window is closed before it is ready', () => {
  // Fire the stored main-window `closed` listener.
  // Expect splash.close() to have been called.
});
```

Keep Electron constructors out of the test by testing the coordinator's
explicit cleanup method rather than mocking the full Electron package.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/startup.test.ts`

Expected: FAIL because the early-close cleanup method is missing.

**Step 3: Implement the main-process integration**

In `src/main/index.ts`:

1. Import `StartupCoordinator`, create one module-level coordinator, and retain
   `mainWindow` for existing shortcut behavior.
2. Before `app.whenReady()`, call `app.requestSingleInstanceLock()`. If it
   returns `false`, call `app.quit()`; otherwise register `app.on(
   'second-instance', () => startup.focusActiveWindow())`.
3. Add `createSplashWindow()`, with `show: false`, `frame: false`,
   `resizable: false`, `maximizable: false`, `minimizable: false`, and
   `skipTaskbar: true`. Hide its menu and load:
   - development: `new URL('splash.html', process.env.VITE_DEV_SERVER_URL).toString()`;
   - packaged: `path.join(__dirname, '../renderer/splash.html')`.
   Show the splash after `did-finish-load`.
4. Change `createWindow()` to set `show: false`, record the main window in the
   coordinator, and add a one-time `ready-to-show` listener that calls
   `startup.showMainWindow()`.
5. Add a main-window `closed` listener that clears both references and closes
   the splash if loading did not finish.
6. In `app.whenReady()`, create the splash first, then await
   `registerIpcHandlers()`, create the hidden main window, and register
   shortcuts.
7. Preserve current `activate` behavior, creating only the main window when no
   windows exist; it must not recreate the splash.

Do not catch errors from `registerIpcHandlers`; startup errors must stay
visible to developers instead of resembling a successful load.

**Step 4: Run focused tests**

Run: `npm test -- src/__tests__/startup.test.ts`

Expected: PASS.

**Step 5: Run type check and production build**

Run:

```bash
npm run typecheck && npm run build
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/main/index.ts src/main/startup.ts src/__tests__/startup.test.ts
git commit -m "feat: show splash screen during application startup"
```

### Task 4: Exercise the packaged startup path

**Files:**
- Verify: `dist/main/index.js`
- Verify: `dist/renderer/splash.html`

**Step 1: Build the application**

Run:

```bash
npm run build
```

Expected: PASS and both `dist/main/index.js` and `dist/renderer/splash.html`
exist.

**Step 2: Run the full unit suite**

Run:

```bash
npm test
```

Expected: PASS.

**Step 3: Manually verify the desktop behavior**

Run the packaged or development Electron application. Confirm the branded
splash appears before the main window, the main window replaces it once ready,
and launching the application a second time focuses the existing window rather
than creating a second process.

**Step 4: Commit any verification-driven correction**

If manual verification requires a correction, add only the affected source and
test files, then commit with a focused `fix:` message.
