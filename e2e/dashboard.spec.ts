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

  test('clears historical data from Settings after exact typed confirmation', async ({ page }) => {
    const player = await addPlayer(page, 'Cleanup Player') as { id: string };
    const completedSession = await createSession(page) as { id: string };
    await checkinPlayer(page, player.id, completedSession.id);
    await page.evaluate((id) => window.api.sessionsEnd(id), completedSession.id);
    const pastTournament = await page.evaluate(
      () => window.api.tournamentsCreate({
        name: 'Past Cleanup Tournament',
        description: '',
        date: '2000-01-01',
        format: 'round_robin',
        courtCount: 4,
      }),
    ) as { id: string };
    const futureTournament = await page.evaluate(
      () => window.api.tournamentsCreate({
        name: 'Future Cleanup Tournament',
        description: '',
        date: '2099-01-01',
        format: 'round_robin',
        courtCount: 4,
      }),
    ) as { id: string };

    await navigateTo(page, '/settings');
    await page.getByRole('button', { name: 'Clear Historical Data' }).click();

    const dialog = page.getByRole('dialog', { name: 'Clear historical data' });
    const confirmation = dialog.getByLabel('Type 清理 to confirm');
    const clearButton = dialog.getByRole('button', { name: 'Permanently Clear Data' });
    await expect(dialog).toBeVisible();
    await expect(clearButton).toBeDisabled();

    await confirmation.fill('clear');
    await expect(clearButton).toBeDisabled();
    await confirmation.fill('清理');
    await expect(clearButton).toBeEnabled();

    await clearButton.click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Clear Historical Data' })).toBeFocused();
    await expect(page.getByText(/Cleared 1 payment, 1 completed session, and 1 historical tournament\./)).toBeVisible();
    await expect(page.evaluate(() => window.api.sessionsList())).resolves.not.toContainEqual(
      expect.objectContaining({ id: completedSession.id }),
    );
    await expect(page.evaluate((id) => window.api.tournamentsList().then(tournaments => tournaments.some(tournament => tournament.id === id)), pastTournament.id)).resolves.toBe(false);
    await expect(page.evaluate((id) => window.api.tournamentsList().then(tournaments => tournaments.some(tournament => tournament.id === id)), futureTournament.id)).resolves.toBe(true);
  });

  test('keeps focus on confirmation while historical data cleanup is busy', async ({ app, page }) => {
    await app.evaluate((_electron) => {
      const { createRequire } = process.getBuiltinModule('module') as typeof import('module');
      const requireFromApp = createRequire(`${process.cwd()}/`);
      const { ipcMain } = requireFromApp('electron') as typeof import('electron');
      ipcMain.removeHandler('data:clearHistory');
      ipcMain.handle('data:clearHistory', () => new Promise(() => {}));
    });

    await navigateTo(page, '/settings');
    await page.getByRole('button', { name: 'Clear Historical Data' }).click();

    const dialog = page.getByRole('dialog', { name: 'Clear historical data' });
    const confirmation = dialog.getByLabel('Type 清理 to confirm');
    await confirmation.fill('清理');
    const clearButton = dialog.getByRole('button', { name: 'Permanently Clear Data' });
    await clearButton.focus();
    await expect(clearButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(dialog.getByRole('button', { name: 'Clearing...' })).toBeDisabled();
    await expect(confirmation).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(confirmation).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(confirmation).toBeFocused();
  });

  test('cancels historical data cleanup without deleting completed history', async ({ page }) => {
    const player = await addPlayer(page, 'Cancelled Cleanup Player') as { id: string };
    const completedSession = await createSession(page) as { id: string };
    await checkinPlayer(page, player.id, completedSession.id);
    await page.evaluate((id) => window.api.sessionsEnd(id), completedSession.id);

    await navigateTo(page, '/settings');
    await page.getByRole('button', { name: 'Clear Historical Data' }).click();

    const dialog = page.getByRole('dialog', { name: 'Clear historical data' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.evaluate(() => window.api.sessionsList())).resolves.toContainEqual(
      expect.objectContaining({ id: completedSession.id, status: 'completed' }),
    );
  });

  test('keeps Tab focus within the historical data cleanup dialog', async ({ page }) => {
    await navigateTo(page, '/settings');
    await page.getByRole('button', { name: 'Clear Historical Data' }).click();

    const dialog = page.getByRole('dialog', { name: 'Clear historical data' });
    const confirmation = dialog.getByLabel('Type 清理 to confirm');
    const clearButton = dialog.getByRole('button', { name: 'Permanently Clear Data' });
    await confirmation.fill('清理');
    await confirmation.focus();

    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(clearButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(confirmation).toBeFocused();

    await page.keyboard.press('Shift+Tab');
    await expect(clearButton).toBeFocused();
  });

  test('dismisses historical data cleanup with Escape and backdrop without deleting history', async ({ page }) => {
    const player = await addPlayer(page, 'Dismissed Cleanup Player') as { id: string };
    const completedSession = await createSession(page) as { id: string };
    await checkinPlayer(page, player.id, completedSession.id);
    await page.evaluate((id) => window.api.sessionsEnd(id), completedSession.id);

    await navigateTo(page, '/settings');
    await page.getByRole('button', { name: 'Clear Historical Data' }).click();

    const dialog = page.getByRole('dialog', { name: 'Clear historical data' });
    await dialog.getByLabel('Type 清理 to confirm').fill('清理');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Clear Historical Data' }).click();
    await expect(dialog.getByRole('button', { name: 'Permanently Clear Data' })).toBeDisabled();
    await page.mouse.click(0, 0);
    await expect(dialog).toBeHidden();

    await expect(page.evaluate(() => window.api.sessionsList())).resolves.toContainEqual(
      expect.objectContaining({ id: completedSession.id, status: 'completed' }),
    );
  });
});
