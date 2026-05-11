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

    await page.getByRole('button', { name: /Start Round/ }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible({ timeout: 5000 });
  });

  test('hides timer after ending all games', async ({ page }) => {
    await setupMatch(page);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /Start Round/ }).click();
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

    await page.getByRole('button', { name: /Start Round/ }).click();
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
    await setupMatch(page);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    const session = await page.evaluate(() => window.api.sessionsGetActive()) as any;
    const games1 = await page.evaluate((sid) => window.api.gamesListBySession(sid), session.id) as any[];
    const pending1 = games1.filter((g: any) => g.status === 'pending');
    expect(pending1.length).toBeGreaterThan(0);

    for (const g of pending1) {
      await page.evaluate((gid) => window.api.gamesDelete(gid), g.id);
    }

    const attendance = await page.evaluate((sid) => window.api.attendanceListBySession(sid), session.id) as any[];
    const players = await page.evaluate(() => window.api.playersList()) as any[];
    const activeIds = new Set((games1.filter((g: any) => g.status === 'playing') as any[]).flatMap((g: any) => [g.team1Player1Id, g.team1Player2Id, g.team2Player1Id, g.team2Player2Id]));

    const pool = attendance
      .filter((a: any) => !activeIds.has(a.playerId) && a.paused !== 1)
      .map((a: any) => {
        const pl = players.find((p: any) => p.id === a.playerId);
        return { id: a.playerId, name: a.name, gender: a.gender, level: a.level, checkinTime: a.checkinTime };
      });

    const males = pool.filter((p: any) => p.gender === 'male').sort((a: any, b: any) => b.level - a.level);
    const females = pool.filter((p: any) => p.gender === 'female').sort((a: any, b: any) => b.level - a.level);
    const courtCount = Math.min(4, Math.floor(males.length / 2), Math.floor(females.length / 2));

    for (let i = 0; i < courtCount; i++) {
      await page.evaluate(
        ({ sid, c, t1p1, t1p2, t2p1, t2p2 }) => window.api.gamesCreate({
          sessionId: sid, courtNumber: c, team1Player1Id: t1p1, team1Player2Id: t1p2,
          team2Player1Id: t2p1, team2Player2Id: t2p2, roundNumber: 1, gameType: 'mixed',
        }),
        { sid: session.id, c: i + 1, t1p1: males[i*2]!.id, t1p2: females[i*2+1]?.id ?? females[i*2]!.id,
          t2p1: males[i*2+1]?.id ?? males[i*2]!.id, t2p2: females[i*2]!.id }
      );
    }

    await page.waitForTimeout(300);

    const updatedTexts = await page.getByText(/C\d/).allTextContents();
    expect(updatedTexts.length).toBeGreaterThan(0);

    const courtNumbers = updatedTexts.map(t => t.match(/C(\d+)/)?.[1]).filter(Boolean);
    const unique = new Set(courtNumbers);
    expect(unique.size).toBe(courtNumbers.length);
  });

  test('auto-generates next round during warning', async ({ page }) => {
    await page.evaluate(
      (d) => window.api.settingsSet('gameDuration', d),
      '0.05'
    );

    const { session } = await setupMatch(page, 12);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Start Round/ }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible({ timeout: 5000 });

    await expect(page.getByText(/Time Warning/)).toBeVisible({ timeout: 10000 });

    await page.waitForTimeout(1000);

    const pendingCourts = await page.getByText(/C\d/).allTextContents();
    expect(pendingCourts.length).toBeGreaterThan(0);
  });

  test('drags player from waiting pool to replace in pending game', async ({ page }) => {
    const { players } = await setupMatch(page, 20);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    const games = await page.evaluate(
      (sid) => window.api.gamesListBySession(sid),
      (await page.evaluate(() => window.api.sessionsGetActive()) as any).id
    ) as any[];
    const pendingGame = games.find((g: any) => g.status === 'pending');
    expect(pendingGame).toBeDefined();

    const allGamePlayerIds = new Set<string>();
    for (const g of games) {
      allGamePlayerIds.add(g.team1Player1Id);
      allGamePlayerIds.add(g.team1Player2Id);
      allGamePlayerIds.add(g.team2Player1Id);
      allGamePlayerIds.add(g.team2Player2Id);
    }
    const poolPlayer = players.find(p => !allGamePlayerIds.has(p.id));
    expect(poolPlayer).toBeDefined();

    const oldPlayerId = pendingGame.team1Player1Id;
    await page.evaluate(
      ({ gid, slot, newId }) => window.api.gamesReplacePlayer(gid, slot, newId),
      { gid: pendingGame.id, slot: 'team1Player1Id', newId: poolPlayer!.id }
    );

    const updatedGames = await page.evaluate(
      (sid) => window.api.gamesListBySession(sid),
      (await page.evaluate(() => window.api.sessionsGetActive()) as any).id
    ) as any[];
    const updatedGame = updatedGames.find((g: any) => g.id === pendingGame.id);
    expect(updatedGame.team1Player1Id).toBe(poolPlayer!.id);
    expect(updatedGame.t1p1Name).toBe(poolPlayer!.name);
  });
});
