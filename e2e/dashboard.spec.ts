import path from 'path';
import type { ElectronApplication } from '@playwright/test';
import { test, expect, addPlayer, checkinPlayer, createSession, navigateTo } from './helpers';

async function insertCompletedSession(
  app: ElectronApplication,
  session: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    courtCount: number;
  },
) {
  const dbModulePath = path.join(__dirname, '..', 'dist', 'main', 'database.js');
  await app.evaluate(
    (_electron, data: typeof session & { dbModulePath: string }) => {
      const { createRequire } = process.getBuiltinModule('module') as typeof import('module');
      const requireFromApp = createRequire(`${process.cwd()}/`);
      const database = requireFromApp(data.dbModulePath) as typeof import('../src/main/database');
      database.run(
        'INSERT INTO sessions (id, date, startTime, endTime, courtCount, status) VALUES (?, ?, ?, ?, ?, ?)',
        [data.id, data.date, data.startTime, data.endTime, data.courtCount, 'completed'],
      );
    },
    { ...session, dbModulePath },
  );
}

test.describe('Dashboard', () => {
  test('toggles the sidebar with an explicit persisted control', async ({ page }) => {
    const sidebar = page.getByRole('navigation');
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
    await expect(sidebar).toHaveJSProperty('offsetWidth', 52);

    await page.getByRole('button', { name: 'Expand sidebar' }).click();

    await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
    await expect(sidebar).toHaveJSProperty('offsetWidth', 192);
    await expect(sidebar.getByRole('link', { name: 'Players' })).toBeVisible();
    await expect(page.evaluate(() => window.localStorage.getItem('autorally-sidebar-expanded'))).resolves.toBe('true');

    await page.reload();

    await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
    await expect(sidebar).toHaveJSProperty('offsetWidth', 192);
  });

  test('shows the app version in the status bar and settings page', async ({ page }) => {
    await expect(page.getByText('v1.0.0')).toBeVisible({ timeout: 5000 });

    await navigateTo(page, '/settings');

    await expect(page.locator('main').getByText('v1.0.0')).toBeVisible({ timeout: 5000 });
  });

  test('shows full database backup controls in settings', async ({ page }) => {
    await navigateTo(page, '/settings');

    await expect(page.getByRole('heading', { name: 'Data Backup' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Export Backup/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Import Backup/ })).toBeVisible();
  });

  test('does not show negative durations from invalid completed sessions', async ({ app, page }) => {
    await insertCompletedSession(app, {
      id: 'bad-duration-session',
      date: '2026-05-19',
      startTime: '2026-05-19T06:00:00.000Z',
      endTime: '2026-05-19T05:29:00.000Z',
      courtCount: 4,
    });
    await insertCompletedSession(app, {
      id: 'valid-duration-session',
      date: '2026-05-12',
      startTime: '2026-05-12T06:00:00.000Z',
      endTime: '2026-05-12T09:00:00.000Z',
      courtCount: 4,
    });

    await navigateTo(page, '/players');
    await navigateTo(page, '/');

    await expect(page.getByText('Recent Sessions')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('body')).not.toContainText(/-\d+m/);
    await expect(page.getByText('avg 3h 0m')).toBeVisible();
    await expect(page.locator('tr', { hasText: '2026-05-19' }).getByText('—')).toBeVisible();
  });

  test('clears historical data through the preload API', async ({ page }) => {
    const player = await addPlayer(page, 'Cleanup Player') as { id: string };
    const completedSession = await createSession(page) as { id: string };
    await checkinPlayer(page, player.id, completedSession.id);
    await page.evaluate((id) => window.api.sessionsEnd(id), completedSession.id);

    const activeSession = await createSession(page) as { id: string };
    await checkinPlayer(page, player.id, activeSession.id);

    const cleanup = await page.evaluate(() => window.api.dataClearHistory());
    expect(cleanup).toEqual({ payments: 2, sessions: 1, tournaments: 0 });

    const [sessions, active, activePayments, players] = await page.evaluate(async (activeSessionId) => [
      await window.api.sessionsList(),
      await window.api.sessionsGetActive(),
      await window.api.paymentsListBySession(activeSessionId),
      await window.api.playersList(),
    ], activeSession.id);

    expect(sessions).not.toContainEqual(expect.objectContaining({ status: 'completed' }));
    expect(active).toEqual(expect.objectContaining({ id: activeSession.id }));
    expect(activePayments).toEqual([]);
    expect(players).toContainEqual(expect.objectContaining({ id: player.id }));
  });
});
