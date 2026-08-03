import { test as base, type ElectronApplication, type Page } from '@playwright/test';
import { _electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { pathToFileURL } from 'url';

type AppFixture = {
  app: ElectronApplication;
  page: Page;
};

function isUnavailableWindowError(error: unknown): boolean {
  return error instanceof Error
    && error.message.includes('Target page, context or browser has been closed');
}

export const test = base.extend<AppFixture>({
  app: async ({}, use) => {
    const mainPath = path.join(__dirname, '..', 'dist', 'main', 'index.js');
    if (!fs.existsSync(mainPath)) {
      throw new Error('Main process not built. Run `npm run build:main` first.');
    }

    // Use a temp userData dir to isolate the test DB from real data
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autorally-e2e-'));

    const app = await _electron.launch({
      args: [
        path.join(__dirname, '..', '.'),
        `--user-data-dir=${tmpDir}`,
      ],
    });

    await use(app);

    try {
      for (const page of app.windows()) {
        if (page.isClosed()) continue;

        try {
          await page.evaluate(async () => {
            const sessions = await window.api.sessionsList() as { id: string; status: string }[];
            for (const session of sessions) {
              if (session.status === 'active') await window.api.sessionsEnd(session.id);
            }
          });
        } catch (error) {
          if (!isUnavailableWindowError(error)) throw error;
          // The renderer can close between windows() and evaluate().
        }
      }
    } finally {
      // app.close() (unlike app.evaluate(() => app.exit(0))) waits for the
      // Electron process to actually exit and closes Playwright's own debug
      // connection to it. Skipping that wait left a dangling handle open
      // across the 44 per-test launches, which the Node worker's own exit
      // then had to wait out — intermittently past the 45s teardown budget,
      // failing CI with "Worker teardown timeout exceeded" despite every
      // test passing.
      await app.close();
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  },

  page: async ({ app }, use) => {
    const mainRendererUrl = pathToFileURL(
      path.join(__dirname, '..', 'dist', 'renderer', 'index.html')
    ).toString();
    const isMainRenderer = (candidate: Page) => (
      !candidate.isClosed() && candidate.url() === mainRendererUrl
    );
    const page = app.windows().find(isMainRenderer)
      ?? await app.waitForEvent('window', { predicate: isMainRenderer });

    await page.waitForFunction(() => (
      Boolean(window.api)
      && document.readyState !== 'loading'
      && Boolean(document.querySelector('nav'))
    ));
    await use(page);
  },
});

export const expect = test.expect;

// Add a player and return the created player
export async function addPlayer(page: Page, name: string, gender: string = 'male', level: number = 3) {
  return await page.evaluate(
    ({ name, gender, level }) => window.api.playersCreate({ name, gender, level, phone: '' }),
    { name, gender, level }
  );
}

// Create a session
export async function createSession(page: Page, courtCount: number = 3) {
  return await page.evaluate(async (courtCount) => {
    await window.api.sessionsCreate(courtCount);
    return window.api.sessionsGetActive();
  }, courtCount);
}

// Checkin a player to a session
export async function checkinPlayer(page: Page, playerId: string, sessionId: string) {
  await page.evaluate(
    ({ playerId, sessionId }) => window.api.attendanceCheckin(playerId, sessionId, 'cash'),
    { playerId, sessionId }
  );
}

// Get the active session
export async function getActiveSession(page: Page) {
  return await page.evaluate(() => window.api.sessionsGetActive());
}

// Navigate via hash router
export async function navigateTo(page: Page, route: string) {
  await page.evaluate((r) => { window.location.hash = r; }, route);
  await page.waitForFunction((r) => window.location.hash === `#${r}`, route);
  await page.waitForTimeout(200);
}

// Setup: add N players (alternating male/female, levels 2-4) and return their IDs
export async function addTestPlayers(page: Page, count: number) {
  const players: { id: string; name: string }[] = [];
  for (let i = 0; i < count; i++) {
    const gender = i % 2 === 0 ? 'male' : 'female';
    const level = 2 + (i % 3);
    const p = await addPlayer(page, `Player${i + 1}`, gender, level) as { id: string; name: string };
    players.push(p);
  }
  return players;
}
