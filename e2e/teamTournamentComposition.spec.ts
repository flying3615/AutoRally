import { test, expect, addPlayer, navigateTo } from './helpers';
import type { Page } from '@playwright/test';

async function createTournament(page: Page, name: string) {
  return await page.evaluate(
    (name) => window.api.tournamentsCreate({ name, description: '', date: '2026-08-01', format: 'round_robin', courtCount: 4 }),
    name
  ) as Promise<{ id: string }>;
}

async function createTeam(page: Page, tournamentId: string, name: string) {
  return await page.evaluate(
    ({ tid, name }) => (window.api as any).tournamentTeamsCreate(tid, name),
    { tid: tournamentId, name }
  ) as Promise<{ id: string }>;
}

async function addTeamPlayer(page: Page, teamId: string, playerId: string) {
  await page.evaluate(
    ({ teamId, playerId }) => (window.api as any).tournamentTeamsAddPlayer(teamId, playerId),
    { teamId, playerId }
  );
}

test.describe('Team match composition', () => {
  test('generates rubbers matching the requested composition and supports reassignment', async ({ page }) => {
    const t = await createTournament(page, 'Composition Cup') as any;

    const teamA = await createTeam(page, t.id, 'Auckland') as any;
    const teamB = await createTeam(page, t.id, 'Wellington') as any;

    // 2 men + 2 women per team — enough for 1 MS, 1 WS, 1 MD, 1 WD, 1 XD
    const aMen = [await addPlayer(page, 'A-M1', 'male', 3) as any, await addPlayer(page, 'A-M2', 'male', 4) as any];
    const aWomen = [await addPlayer(page, 'A-W1', 'female', 3) as any, await addPlayer(page, 'A-W2', 'female', 4) as any];
    const bMen = [await addPlayer(page, 'B-M1', 'male', 3) as any, await addPlayer(page, 'B-M2', 'male', 4) as any];
    const bWomen = [await addPlayer(page, 'B-W1', 'female', 3) as any, await addPlayer(page, 'B-W2', 'female', 4) as any];

    for (const p of [...aMen, ...aWomen]) await addTeamPlayer(page, teamA.id, p.id);
    for (const p of [...bMen, ...bWomen]) await addTeamPlayer(page, teamB.id, p.id);

    const result = await page.evaluate(
      (tid) => (window.api as any).tournamentTeamMatchesGenerate(tid, { ms: 1, ws: 1, md: 1, xd: 1, wd: 1 }),
      t.id
    ) as { teamMatches: any[]; warnings: string[] };

    expect(result.warnings).toEqual([]);
    expect(result.teamMatches).toHaveLength(1); // 2 teams -> 1 tie

    const detail = await page.evaluate((tid) => window.api.tournamentsGet(tid), t.id) as any;
    const categories = detail.matches.map((m: any) => m.category).sort();
    expect(categories).toEqual(['MD', 'MS', 'WD', 'WS', 'XD']);

    const mdGame = detail.matches.find((m: any) => m.category === 'MD');
    expect(mdGame.team1Player2Id).not.toBeNull(); // doubles has a second player
    const msGame = detail.matches.find((m: any) => m.category === 'MS');
    expect(msGame.team1Player2Id).toBeNull(); // singles does not

    // Fine-tune: swap MS's team1 player to the other eligible man
    const otherMan = aMen.find((p: any) => p.id !== msGame.team1Player1Id)!;
    await page.evaluate(
      ({ gameId, assignment }) => (window.api as any).tournamentTeamMatchesReassignPlayers(gameId, assignment),
      { gameId: msGame.id, assignment: { team1Player1Id: otherMan.id, team1Player2Id: null, team2Player1Id: msGame.team2Player1Id, team2Player2Id: null } }
    );
    const detail2 = await page.evaluate((tid) => window.api.tournamentsGet(tid), t.id) as any;
    const msGameAfter = detail2.matches.find((m: any) => m.id === msGame.id);
    expect(msGameAfter.team1Player1Id).toBe(otherMan.id);

    // UI: navigate to bracket tab and confirm a category badge renders
    await navigateTo(page, `/tournaments/${t.id}`);
    await page.getByRole('button', { name: 'teams', exact: true }).click();
    await page.getByRole('button', { name: 'bracket', exact: true }).click();
    await expect(page.getByText('MS1', { exact: true }).first()).toBeVisible({ timeout: 10000 });

    // UI: the live court panel must show both players of a doubles pair, not just one
    const wdGame = detail.matches.find((m: any) => m.category === 'WD');
    const wdTeam1Names = [wdGame.team1Player1Id, wdGame.team1Player2Id].map(
      (pid: string) => aWomen.find((p: any) => p.id === pid)!.name
    );
    await navigateTo(page, `/tournaments/${t.id}/live`);
    await expect(page.getByText(`${wdTeam1Names[0]} / ${wdTeam1Names[1]}`, { exact: false }).first()).toBeVisible({ timeout: 10000 });
  });

  test('skips a category and reports a warning when a team lacks eligible players', async ({ page }) => {
    const t = await createTournament(page, 'Skip Cup') as any;
    const teamA = await createTeam(page, t.id, 'Christchurch') as any;
    const teamB = await createTeam(page, t.id, 'Hamilton') as any;

    // Team A has no women at all
    const aMan = await addPlayer(page, 'A-Only-Man', 'male', 3) as any;
    const bMan = await addPlayer(page, 'B-Man', 'male', 3) as any;
    const bWoman = await addPlayer(page, 'B-Woman', 'female', 3) as any;

    await addTeamPlayer(page, teamA.id, aMan.id);
    await addTeamPlayer(page, teamB.id, bMan.id);
    await addTeamPlayer(page, teamB.id, bWoman.id);

    const result = await page.evaluate(
      (tid) => (window.api as any).tournamentTeamMatchesGenerate(tid, { ms: 1, ws: 1, md: 0, xd: 0, wd: 0 }),
      t.id
    ) as { teamMatches: any[]; warnings: string[] };

    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('WS');

    const detail = await page.evaluate((tid) => window.api.tournamentsGet(tid), t.id) as any;
    expect(detail.matches).toHaveLength(1); // only MS generated
    expect(detail.matches[0].category).toBe('MS');
  });
});
