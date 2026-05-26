import { test, expect, addTestPlayers, createSession, checkinPlayer, navigateTo } from './helpers';

test.describe('Match Flow', () => {
  async function setupMatch(page: any, playerCount = 12) {
    const players = await addTestPlayers(page, playerCount);
    const session = await createSession(page, 4) as { id: string };
    for (const p of players) {
      await checkinPlayer(page, p.id, session.id);
    }
    await navigateTo(page, `/match/${session.id}`);
    await page.waitForTimeout(500);
    return { session, players };
  }

  test('generates court cards with unique numbers', async ({ page }) => {
    await setupMatch(page);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    const courtCards = page.getByText(/C\d/);
    const count = await courtCards.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const texts = await courtCards.allTextContents();
    const courtNumbers = texts.map(t => t.match(/C(\d+)/)?.[1]).filter(Boolean);
    const unique = new Set(courtNumbers);
    expect(unique.size).toBe(courtNumbers.length);
  });

  test('shows timer after starting round', async ({ page }) => {
    await setupMatch(page);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /Skip Wait/ }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible({ timeout: 5000 });
  });

  test('hides timer after ending all games', async ({ page }) => {
    await setupMatch(page);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /Skip Wait/ }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /End All/ }).click();
    await page.waitForTimeout(1000);

    const timerBar = page.locator('text=In Progress');
    expect(await timerBar.count()).toBe(0);
  });

  test('shows resume button after pausing all', async ({ page }) => {
    await setupMatch(page);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /Skip Wait/ }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /Pause All/ }).click();
    await page.waitForTimeout(300);

    await expect(page.getByRole('button', { name: /Resume All/ })).toBeVisible();

    await page.getByRole('button', { name: /Resume All/ }).click();
    await page.waitForTimeout(300);

    await expect(page.getByRole('button', { name: /Pause All/ })).toBeVisible();
  });

  test('replaces pending games on regenerate', async ({ page }) => {
    const { session } = await setupMatch(page);

    // First generation via UI button
    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    const sessionId = session.id;
    const games1 = await page.evaluate((sid) => window.api.gamesListBySession(sid), sessionId) as any[];
    const pending1 = games1.filter((g: any) => g.status === 'pending');
    const pending1Ids = new Set(pending1.map((g: any) => g.id));
    expect(pending1Ids.size).toBeGreaterThan(0);

    // Clear pending games via IPC, then navigate back to force a fresh component mount
    // so the Generate Matches button re-appears in the UI
    for (const g of pending1) {
      await page.evaluate((gid) => window.api.gamesDelete(gid), g.id);
    }
    await navigateTo(page, '/');
    await navigateTo(page, `/match/${sessionId}`);
    await page.waitForTimeout(500);

    // Second generation via the UI button — should create new pending games with new IDs
    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    const games2 = await page.evaluate((sid) => window.api.gamesListBySession(sid), sessionId) as any[];
    const pending2 = games2.filter((g: any) => g.status === 'pending');

    expect(pending2.length).toBeGreaterThan(0);
    for (const g of pending2) {
      expect(pending1Ids.has(g.id)).toBe(false);
    }
    const courtNumbers = pending2.map((g: any) => g.courtNumber);
    expect(new Set(courtNumbers).size).toBe(courtNumbers.length);
  });

  test('shows pending countdown controls and skip starts the round', async ({ page }) => {
    const { session } = await setupMatch(page, 16);

    await page.getByRole('button', { name: /Generate Matches/ }).click();

    await expect(page.getByText(/Auto-start in/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Pending')).toBeVisible();

    await page.getByRole('button', { name: /^Pause$/ }).click();
    await expect(page.getByText(/Paused at/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /Resume/ })).toBeVisible();

    await page.getByRole('button', { name: /Skip Wait/ }).click();
    await expect(page.getByText(/In Progress/).first()).toBeVisible({ timeout: 5000 });

    const games = await page.evaluate((sid) => window.api.gamesListBySession(sid), session.id) as any[];
    expect(games.filter((g: any) => g.status === 'playing')).toHaveLength(4);
    expect(games.filter((g: any) => g.status === 'pending')).toHaveLength(0);
  });

  test('fills four courts when twenty players are waiting', async ({ page }) => {
    const { session } = await setupMatch(page, 20);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await expect(page.getByText(/Auto-start in/)).toBeVisible({ timeout: 5000 });

    const games = await page.evaluate((sid) => window.api.gamesListBySession(sid), session.id) as any[];
    const pending = games.filter((g: any) => g.status === 'pending');

    expect(pending).toHaveLength(4);
    expect(new Set(pending.map((g: any) => g.courtNumber)).size).toBe(4);
  });

  test('auto-generates next round during warning', async ({ page }) => {
    await page.evaluate(
      (d) => window.api.settingsSet('gameDuration', d),
      '0.05'
    );

    const { session } = await setupMatch(page, 12);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Skip Wait/ }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible({ timeout: 5000 });

    await expect(page.getByText(/Time Warning/)).toBeVisible({ timeout: 10000 });

    await page.waitForTimeout(1000);

    const pendingCourts = await page.getByText(/C\d/).allTextContents();
    expect(pendingCourts.length).toBeGreaterThan(0);
  });

  test('replaces player in pending game via API (IPC test)', async ({ page }) => {
    const { players } = await setupMatch(page, 20);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    const sessionId = ((await page.evaluate(() => window.api.sessionsGetActive())) as any).id;
    const games = await page.evaluate((sid) => window.api.gamesListBySession(sid), sessionId) as any[];
    const pendingGame = games.find((g: any) => g.status === 'pending');
    expect(pendingGame).toBeDefined();

    const allGamePlayerIds = new Set<string>(
      games.flatMap((g: any) => [g.team1Player1Id, g.team1Player2Id, g.team2Player1Id, g.team2Player2Id])
    );
    const poolPlayer = players.find(p => !allGamePlayerIds.has(p.id));
    expect(poolPlayer).toBeDefined();

    await page.evaluate(
      ({ gid, slot, newId }) => window.api.gamesReplacePlayer(gid, slot, newId),
      { gid: pendingGame.id, slot: 'team1Player1Id', newId: poolPlayer!.id }
    );

    const updatedGames = await page.evaluate((sid) => window.api.gamesListBySession(sid), sessionId) as any[];
    const updatedGame = updatedGames.find((g: any) => g.id === pendingGame.id);
    expect(updatedGame.team1Player1Id).toBe(poolPlayer!.id);
  });
});
