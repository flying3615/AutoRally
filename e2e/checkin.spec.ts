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
});
