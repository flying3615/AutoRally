# Author About Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "About" card to the Settings page showing the app author's name and GitHub link, with a correctly-wired external-link handler so the link opens in the system browser instead of a broken chromeless Electron window.

**Architecture:** Two small, independent changes. (1) `src/main/index.ts` gets a `setWindowOpenHandler` on the main `BrowserWindow` so any `target="_blank"` link anywhere in the renderer opens via `shell.openExternal` instead of spawning a new Electron window. (2) `src/renderer/pages/Settings.tsx` gets a new static "About" section appended after the existing "Upcoming Sessions" section, following the file's established section pattern (`border-t border-zinc-200 pt-10` + uppercase label + white bordered card). No new state, no new IPC channels, no new dependencies.

**Tech Stack:** Electron (main process), React 19 + Tailwind CSS 4 (renderer), TypeScript, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-12-author-about-card-design.md`

---

### Task 1: Wire up external-link handling in the main process

**Files:**
- Modify: `src/main/index.ts:1` (import line)
- Modify: `src/main/index.ts:20-21` (after `mainWindow.setAutoHideMenuBar(true);`)

- [ ] **Step 1: Add `shell` to the electron import**

In `src/main/index.ts`, change line 1 from:

```ts
import { app, BrowserWindow, globalShortcut } from 'electron';
```

to:

```ts
import { app, BrowserWindow, globalShortcut, shell } from 'electron';
```

- [ ] **Step 2: Register the window-open handler**

In `src/main/index.ts`, immediately after this existing line (currently line 22):

```ts
  mainWindow.setAutoHideMenuBar(true);
```

insert:

```ts

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
```

The full block should now read:

```ts
  mainWindow.setAutoHideMenuBar(true);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
```

- [ ] **Step 3: Typecheck the main process**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): open target=_blank links in system browser"
```

---

### Task 2: Add the About section to the Settings page

**Files:**
- Modify: `src/renderer/pages/Settings.tsx:428` (Upcoming Sessions wrapper div)
- Modify: `src/renderer/pages/Settings.tsx:497-498` (insert new section after Upcoming Sessions closes, before the Modal block)

- [ ] **Step 1: Give the Upcoming Sessions section a bottom margin**

This matches the spacing pattern already used between "Court Count"/"Game Duration"/"Session Fee" and "Data Backup" (each section but the last has `mb-10`; the visually-last section doesn't). Since About will now be the last section, Upcoming Sessions needs the margin instead.

In `src/renderer/pages/Settings.tsx`, change:

```tsx
        {/* Upcoming Sessions */}
        <div className="border-t border-zinc-200 pt-10">
```

to:

```tsx
        {/* Upcoming Sessions */}
        <div className="border-t border-zinc-200 pt-10 mb-10">
```

- [ ] **Step 2: Insert the About section**

In `src/renderer/pages/Settings.tsx`, find this exact block (the end of the Upcoming Sessions section, right before the Modal render):

```tsx
            </div>
          )}
        </div>

        {/* Modal */}
        {showAdd && (
```

Replace it with (adds the new About section between the closing `</div>` of Upcoming Sessions and the Modal block):

```tsx
            </div>
          )}
        </div>

        {/* About */}
        <div className="border-t border-zinc-200 pt-10">
          <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">About</p>
          <div className="bg-white border border-zinc-200/60 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
              GL
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">Gabriel Liu</p>
              <a
                href="https://github.com/flying3615"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                github.com/flying3615
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Modal */}
        {showAdd && (
```

- [ ] **Step 3: Typecheck the renderer**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/Settings.tsx
git commit -m "feat(settings): add About card with author name and GitHub link"
```

---

### Task 3: Build, visually verify, and regression-test

No source changes in this task — it only builds and checks the previous two tasks actually work together in the real app. Nothing to commit at the end.

**Files:** none (verification only)

- [ ] **Step 1: Build the app**

Run: `npm run build`
Expected: builds `dist/main/index.js` and `dist/renderer/*` with no errors.

- [ ] **Step 2: Visually verify the About card renders correctly**

Write a throwaway script (do not commit it — delete when done, or keep it outside the repo, e.g. in `/tmp`) that launches the built app via Playwright's `_electron.launch()`, navigates to `/settings`, and screenshots the page. This mirrors the pattern already used in `e2e/helpers.ts`.

```ts
// scratch script, not part of the repo
import { _electron } from 'playwright';
import path from 'path';

async function main() {
  const app = await _electron.launch({ args: [path.resolve('.')] });
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean((window as any).api) && document.querySelector('nav'));
  await page.evaluate(() => { window.location.hash = '/settings'; });
  await page.waitForTimeout(500);

  const link = page.getByRole('link', { name: /github.com\/flying3615/ });
  await link.scrollIntoViewIfNeeded();
  console.log('href:', await link.getAttribute('href'));
  console.log('target:', await link.getAttribute('target'));
  console.log('name visible:', await page.getByText('Gabriel Liu').isVisible());

  await page.screenshot({ path: 'about-card-check.png', fullPage: true });
  await app.close();
}

main();
```

Run it with `npx tsx <script path>` from the repo root (so `node_modules` resolves).

Expected output:
```
href: https://github.com/flying3615
target: _blank
name visible: true
```

Open `about-card-check.png` and confirm: solid emerald circle with "GL", "Gabriel Liu" name, "github.com/flying3615" link with an arrow icon, positioned as the last section on the Settings page, no gradients, styling consistent with the rest of the page.

- [ ] **Step 3: Run the unit test suite**

Run: `npm test`
Expected: all existing tests still pass (this change adds no new unit tests per the spec — the About card is static content with no logic to unit-test).

- [ ] **Step 4: Run the relevant e2e specs for regression**

Run: `npx playwright test e2e/dashboard.spec.ts e2e/session.spec.ts`
Expected: same pass/fail results as before this change (the pre-existing `v1.0.0` version-string failure in `dashboard.spec.ts` is unrelated and expected — confirm no *new* failures were introduced).

---

## Self-Review Notes

- **Spec coverage:** main-process `setWindowOpenHandler` fix (Task 1) ✓, Settings About card with name+link+icon, solid emerald avatar, no gradients (Task 2) ✓, typecheck/build/test verification, no new Vitest tests per spec (Task 3) ✓, out-of-scope items (app icon, package.json author metadata) intentionally excluded ✓.
- **No placeholders:** every step has literal code/commands, no "add appropriate X" phrasing.
- **Type/name consistency:** `mainWindow.webContents.setWindowOpenHandler` and `shell.openExternal` used consistently; JSX section matches the exact existing surrounding code so the anchor-based edit will apply cleanly.
