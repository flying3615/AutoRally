import { test, expect, addPlayer, checkinPlayer, createSession, navigateTo } from './helpers';

test.describe('Payments', () => {
  test('expanding a session shows its paid total and each player\'s payment status', async ({ page }) => {
    const session = await createSession(page, 2) as { id: string };
    const player = await addPlayer(page, 'Pat Paid') as { id: string };
    await checkinPlayer(page, player.id, session.id);

    await navigateTo(page, '/payments');
    await page.getByRole('button', { name: 'All Records' }).click();

    // Present on first render, regardless of expand state — the paid/unpaid
    // total only appears in the row's accessible name after it's expanded.
    const sessionRow = page.getByRole('button', { name: /courts/ });
    await expect(sessionRow).toBeVisible();
    await sessionRow.click();

    await expect(sessionRow).toContainText('$10 paid');
    await expect(page.getByText('Pat Paid')).toBeVisible();
    await expect(page.getByText('Paid', { exact: true })).toBeVisible();
  });

  test('a session with no check-ins shows no players checked in', async ({ page }) => {
    await createSession(page, 2);

    await navigateTo(page, '/payments');
    await page.getByRole('button', { name: 'All Records' }).click();
    await page.getByRole('button', { name: /courts/ }).click();

    await expect(page.getByText('No players checked in')).toBeVisible();
  });
});
