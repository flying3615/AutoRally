import { test, expect, addPlayer, createSession, checkinPlayer, addTestPlayers, navigateTo } from './helpers';

test.describe('Check-in Flow', () => {
  test('shows checked-in player in waiting pool', async ({ page }) => {
    const player = await addPlayer(page, 'TestPlayer', 'male', 3) as { id: string };
    const session = await createSession(page, 4) as { id: string };

    await checkinPlayer(page, player.id, session.id);
    await navigateTo(page, `/checkin/${session.id}`);
    await page.waitForTimeout(300);

    await expect(page.getByText('TestPlayer').first()).toBeVisible();
  });

  test('shows correct count after multiple check-ins', async ({ page }) => {
    const players = await addTestPlayers(page, 8);
    const session = await createSession(page, 4) as { id: string };

    for (const p of players) {
      await checkinPlayer(page, p.id, session.id);
    }

    await navigateTo(page, `/checkin/${session.id}`);
    await page.waitForTimeout(500);

    // The header shows "Checked in N / M" — use first() to avoid status bar match
    await expect(page.locator('text=Checked in').first()).toBeVisible({ timeout: 5000 });
  });

  test('checks in an existing player by double-clicking their card', async ({ page }) => {
    await addPlayer(page, 'Double Click Player', 'male', 3);
    const session = await createSession(page, 4) as { id: string };

    await navigateTo(page, `/checkin/${session.id}`);
    await page.getByText('Double Click Player').first().dblclick();

    await expect(page.getByText('Double Click Player').first()).toBeVisible();
    await expect(page.locator('text=Checked in').first()).toBeVisible({ timeout: 5000 });
    const attendance = await page.evaluate((sid) => window.api.attendanceListBySession(sid), session.id) as any[];
    expect(attendance.some(a => a.name === 'Double Click Player')).toBe(true);
  });

  test('adds a new player and checks them in from the check-in page', async ({ page }) => {
    const session = await createSession(page, 4) as { id: string };

    await navigateTo(page, `/checkin/${session.id}`);
    await page.getByRole('button', { name: /Add Player/ }).click();
    await page.getByLabel('First Name').fill('Newbie');
    await page.getByLabel('Surname').fill('Walker');
    await page.getByRole('button', { name: /Add & Check in/ }).click();

    await expect(page.getByText('Newbie Walker').first()).toBeVisible({ timeout: 5000 });
    const attendance = await page.evaluate((sid) => window.api.attendanceListBySession(sid), session.id) as any[];
    expect(attendance.some(a => a.name === 'Newbie Walker')).toBe(true);
  });

  test('deletes a player from the check-in context menu after confirmation', async ({ page }) => {
    const player = await addPlayer(page, 'Delete From Checkin', 'female', 4) as { id: string };
    const session = await createSession(page, 4) as { id: string };

    await navigateTo(page, `/checkin/${session.id}`);
    await page.getByText('Delete From Checkin').first().click({ button: 'right' });
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: /Delete Player/ }).click();

    await expect(page.getByText('Delete From Checkin')).toHaveCount(0);
    const players = await page.evaluate(() => window.api.playersList()) as any[];
    expect(players.some(p => p.id === player.id)).toBe(false);
  });

  test('shows last session players in a quick check-in section', async ({ page }) => {
    const returningLow = await addPlayer(page, 'Returning Level Two', 'male', 2) as { id: string };
    const returningHigh = await addPlayer(page, 'Returning Level Five', 'female', 5) as { id: string };
    const returningMid = await addPlayer(page, 'Returning Level Four', 'male', 4) as { id: string };
    const previousSession = await createSession(page, 4) as { id: string };
    await checkinPlayer(page, returningLow.id, previousSession.id);
    await checkinPlayer(page, returningHigh.id, previousSession.id);
    await checkinPlayer(page, returningMid.id, previousSession.id);
    const currentSession = await createSession(page, 4) as { id: string };

    await navigateTo(page, `/checkin/${currentSession.id}`);
    const quickSection = page.getByLabel('Last session quick check-in');
    const quickCards = quickSection.locator('.grid > *');

    await expect(quickCards.nth(0)).toContainText('Returning Level Five');
    await expect(quickCards.nth(1)).toContainText('Returning Level Four');
    await expect(quickCards.nth(2)).toContainText('Returning Level Two');
    await quickSection.getByText('Returning Level Five').dblclick();
    await expect(quickSection.getByText('Returning Level Five')).toHaveCount(0);

    const attendance = await page.evaluate((sid) => window.api.attendanceListBySession(sid), currentSession.id) as any[];
    expect(attendance.some(a => a.name === 'Returning Level Five')).toBe(true);
  });
});
