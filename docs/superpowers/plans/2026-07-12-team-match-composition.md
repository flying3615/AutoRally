# Team Match Composition (MS/WS/MD/XD/WD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the team round-robin's single `gamesPerMatch` number with a configurable 5-category rubber composition (Men's Singles / Women's Singles / Men's Doubles / Mixed Doubles / Women's Doubles), auto-assign players by gender with level-based doubles pairing, label each generated rubber by category, and let organizers fine-tune (swap) player assignments before a rubber is played.

**Architecture:** A new pure function `buildTeamMatchGames` in `src/main/tournament.ts` (alongside the existing `generateKnockoutMatches`/`generateRoundRobinMatches`) computes, for one team-vs-team tie, which players play which rubber given each team's roster and the composition. `src/main/ipc.ts`'s `tournament:teamMatches:generate` handler is rewired to call it per Berger-schedule tie instead of its current generic-singles loop, and a new `tournament:teamMatches:reassignPlayers` handler lets the renderer swap a not-yet-played rubber's players. Two new nullable columns (`category`, `slotNumber`) are added to `tournament_matches` so any rubber can be labeled; two team-match-record columns become five (`msCount`/`wsCount`/`mdCount`/`xdCount`/`wdCount`) so the composition used for a tie is stored. The renderer (`TournamentDetail.tsx`) gets a 5-input composition form instead of one number, a category badge on rubber cards, and an "Edit Players" modal for fine-tuning.

**Tech Stack:** Electron main process (SQLite via sql.js), TypeScript, React 19, Tailwind CSS 4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-12-team-match-composition-design.md`

**Known follow-up (not in this plan):** `src/renderer/pages/TournamentLivePanel.tsx` (route `/tournaments/:id/live`) also renders individual team-match rubbers for live court assignment/scoring, and was not covered by the approved spec. It will keep working unchanged (the two new fields are optional additions to existing data), but it won't show category badges — that's a small separate follow-up if wanted later.

---

### Task 1: Add `category`/`slotNumber` and composition-count columns to the schema

**Files:**
- Modify: `src/main/database.ts:235` (migration list, insert new lines after the existing `teamMatchId` migration)

- [ ] **Step 1: Add the six new columns as migrations**

In `src/main/database.ts`, immediately after this existing line:

```ts
  try { db.run('ALTER TABLE tournament_matches ADD COLUMN teamMatchId TEXT REFERENCES tournament_team_matches(id)'); dirty = true; } catch (_) { /* already exists */ }
```

insert:

```ts
  try { db.run('ALTER TABLE tournament_matches ADD COLUMN category TEXT'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_matches ADD COLUMN slotNumber INTEGER'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_team_matches ADD COLUMN msCount INTEGER NOT NULL DEFAULT 0'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_team_matches ADD COLUMN wsCount INTEGER NOT NULL DEFAULT 0'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_team_matches ADD COLUMN mdCount INTEGER NOT NULL DEFAULT 0'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_team_matches ADD COLUMN xdCount INTEGER NOT NULL DEFAULT 0'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_team_matches ADD COLUMN wdCount INTEGER NOT NULL DEFAULT 0'); dirty = true; } catch (_) { /* already exists */ }
```

- [ ] **Step 2: Typecheck the main process**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: no errors (this step only adds SQL strings, no type surface changes yet).

- [ ] **Step 3: Commit**

```bash
git add src/main/database.ts
git commit -m "feat(db): add category/slotNumber and per-category rubber counts for team matches"
```

---

### Task 2: `buildTeamMatchGames` pure function with TDD unit tests

**Files:**
- Modify: `src/main/tournament.ts` (add new exports at the end of the file)
- Modify: `src/__tests__/tournament.test.ts` (add new `describe` block)

This is the core algorithm: given two team rosters (with gender + level) and a composition, decide who plays which rubber. Follow TDD — write the failing tests first, then the implementation.

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/tournament.test.ts`, after the existing imports, add `buildTeamMatchGames` to the import list:

```ts
import {
  buildNextKnockoutMatches,
  buildTeamMatchGames,
  computeTournamentStandings,
  generateKnockoutMatches,
  generateRoundRobinMatches,
  validateTournamentRegistration,
  type TournamentMatchRecord,
  type TournamentRegistration,
} from '../main/tournament';
```

Then append this new `describe` block at the end of the file:

```ts
function rosterPlayer(id: string, gender: 'male' | 'female', level: number) {
  return { playerId: id, gender, level };
}

describe('buildTeamMatchGames', () => {
  it('cycles singles picks when the roster is smaller than the requested count', () => {
    const team1 = [rosterPlayer('m1', 'male', 3)];
    const team2 = [rosterPlayer('m2', 'male', 3), rosterPlayer('m3', 'male', 4)];
    const result = buildTeamMatchGames(team1, team2, { ms: 2, ws: 0, md: 0, xd: 0, wd: 0 });

    expect(result.skipped).toEqual([]);
    expect(result.games).toHaveLength(2);
    expect(result.games[0]).toMatchObject({ category: 'MS', slotNumber: 1, team1Player1Id: 'm1', team2Player1Id: 'm2' });
    expect(result.games[1]).toMatchObject({ category: 'MS', slotNumber: 2, team1Player1Id: 'm1', team2Player1Id: 'm3' });
  });

  it('pairs doubles partners by adjacent level after sorting, not roster order', () => {
    const team1 = [rosterPlayer('strong', 'male', 5), rosterPlayer('weak', 'male', 1), rosterPlayer('mid1', 'male', 3), rosterPlayer('mid2', 'male', 3)];
    const team2 = [rosterPlayer('a', 'male', 2), rosterPlayer('b', 'male', 2)];
    const result = buildTeamMatchGames(team1, team2, { ms: 0, ws: 0, md: 2, xd: 0, wd: 0 });

    expect(result.skipped).toEqual([]);
    // Sorted by level: weak(1), mid1(3), mid2(3), strong(5) -> pairs: [weak,mid1], [mid2,strong]
    expect(result.games).toHaveLength(2);
    expect(result.games[0]).toMatchObject({ category: 'MD', slotNumber: 1, team1Player1Id: 'weak', team1Player2Id: 'mid1' });
    expect(result.games[1]).toMatchObject({ category: 'MD', slotNumber: 2, team1Player1Id: 'mid2', team1Player2Id: 'strong' });
  });

  it('pairs mixed doubles by matching rank between the male and female pools', () => {
    const team1 = [
      rosterPlayer('m-low', 'male', 1), rosterPlayer('m-high', 'male', 5),
      rosterPlayer('f-low', 'female', 2), rosterPlayer('f-high', 'female', 4),
    ];
    const team2 = [rosterPlayer('om', 'male', 3), rosterPlayer('of', 'female', 3)];
    const result = buildTeamMatchGames(team1, team2, { ms: 0, ws: 0, md: 0, xd: 2, wd: 0 });

    expect(result.skipped).toEqual([]);
    // Male sorted: m-low(1), m-high(5). Female sorted: f-low(2), f-high(4). Rank-matched pairs: [m-low,f-low], [m-high,f-high]
    expect(result.games[0]).toMatchObject({ category: 'XD', slotNumber: 1, team1Player1Id: 'm-low', team1Player2Id: 'f-low' });
    expect(result.games[1]).toMatchObject({ category: 'XD', slotNumber: 2, team1Player1Id: 'm-high', team1Player2Id: 'f-high' });
  });

  it('skips a category when one team has no eligible players for it', () => {
    const team1 = [rosterPlayer('m1', 'male', 3)]; // no women
    const team2 = [rosterPlayer('f1', 'female', 3), rosterPlayer('m2', 'male', 3)];
    const result = buildTeamMatchGames(team1, team2, { ms: 1, ws: 1, md: 0, xd: 0, wd: 0 });

    expect(result.skipped).toEqual(['WS']);
    expect(result.games).toHaveLength(1);
    expect(result.games[0]!.category).toBe('MS');
  });

  it('skips a doubles category when a team has fewer than 2 eligible players', () => {
    const team1 = [rosterPlayer('m1', 'male', 3)]; // only one man, can't pair
    const team2 = [rosterPlayer('m2', 'male', 3), rosterPlayer('m3', 'male', 4)];
    const result = buildTeamMatchGames(team1, team2, { ms: 0, ws: 0, md: 1, xd: 0, wd: 0 });

    expect(result.skipped).toEqual(['MD']);
    expect(result.games).toHaveLength(0);
  });

  it('does not generate or skip a category whose count is 0', () => {
    const team1 = [rosterPlayer('m1', 'male', 3)];
    const team2 = [rosterPlayer('m2', 'male', 3)];
    const result = buildTeamMatchGames(team1, team2, { ms: 0, ws: 0, md: 0, xd: 0, wd: 0 });

    expect(result.games).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/tournament.test.ts`
Expected: FAIL — `buildTeamMatchGames` is not exported from `../main/tournament` yet.

- [ ] **Step 3: Implement `buildTeamMatchGames`**

Append to the end of `src/main/tournament.ts`:

```ts
export interface TeamMatchComposition {
  ms: number;
  ws: number;
  md: number;
  xd: number;
  wd: number;
}

export interface TeamRosterPlayer {
  playerId: string;
  gender: 'male' | 'female';
  level: number;
}

export type TeamMatchCategory = 'MS' | 'WS' | 'MD' | 'XD' | 'WD';

export interface TeamMatchGameSpec {
  category: TeamMatchCategory;
  slotNumber: number;
  team1Player1Id: string;
  team1Player2Id: string | null;
  team2Player1Id: string;
  team2Player2Id: string | null;
}

export interface BuildTeamMatchGamesResult {
  games: TeamMatchGameSpec[];
  skipped: TeamMatchCategory[];
}

function byGender(roster: TeamRosterPlayer[], gender: 'male' | 'female'): TeamRosterPlayer[] {
  return roster.filter(p => p.gender === gender);
}

function pickCycled(pool: TeamRosterPlayer[], count: number): string[] {
  if (pool.length === 0) return [];
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]!.playerId);
}

function pairAdjacentByLevel(pool: TeamRosterPlayer[], count: number): Array<[string, string]> {
  if (pool.length < 2) return [];
  const sorted = [...pool].sort((a, b) => a.level - b.level);
  const n = sorted.length;
  return Array.from({ length: count }, (_, i) => {
    const idxA = (2 * i) % n;
    const idxB = (2 * i + 1) % n;
    return [sorted[idxA]!.playerId, sorted[idxB]!.playerId] as [string, string];
  });
}

function pairMixedByLevel(malePool: TeamRosterPlayer[], femalePool: TeamRosterPlayer[], count: number): Array<[string, string]> {
  if (malePool.length === 0 || femalePool.length === 0) return [];
  const sortedMale = [...malePool].sort((a, b) => a.level - b.level);
  const sortedFemale = [...femalePool].sort((a, b) => a.level - b.level);
  return Array.from({ length: count }, (_, i) => [
    sortedMale[i % sortedMale.length]!.playerId,
    sortedFemale[i % sortedFemale.length]!.playerId,
  ] as [string, string]);
}

export function buildTeamMatchGames(
  team1Roster: TeamRosterPlayer[],
  team2Roster: TeamRosterPlayer[],
  composition: TeamMatchComposition,
): BuildTeamMatchGamesResult {
  const games: TeamMatchGameSpec[] = [];
  const skipped: TeamMatchCategory[] = [];

  const singlesSpecs: Array<{ category: TeamMatchCategory; gender: 'male' | 'female'; count: number }> = [
    { category: 'MS', gender: 'male', count: composition.ms },
    { category: 'WS', gender: 'female', count: composition.ws },
  ];
  for (const spec of singlesSpecs) {
    if (spec.count <= 0) continue;
    const pool1 = byGender(team1Roster, spec.gender);
    const pool2 = byGender(team2Roster, spec.gender);
    if (pool1.length === 0 || pool2.length === 0) { skipped.push(spec.category); continue; }
    const picks1 = pickCycled(pool1, spec.count);
    const picks2 = pickCycled(pool2, spec.count);
    for (let i = 0; i < spec.count; i++) {
      games.push({
        category: spec.category,
        slotNumber: i + 1,
        team1Player1Id: picks1[i]!,
        team1Player2Id: null,
        team2Player1Id: picks2[i]!,
        team2Player2Id: null,
      });
    }
  }

  const doublesSpecs: Array<{ category: TeamMatchCategory; gender: 'male' | 'female'; count: number }> = [
    { category: 'MD', gender: 'male', count: composition.md },
    { category: 'WD', gender: 'female', count: composition.wd },
  ];
  for (const spec of doublesSpecs) {
    if (spec.count <= 0) continue;
    const pool1 = byGender(team1Roster, spec.gender);
    const pool2 = byGender(team2Roster, spec.gender);
    const pairs1 = pairAdjacentByLevel(pool1, spec.count);
    const pairs2 = pairAdjacentByLevel(pool2, spec.count);
    if (pairs1.length === 0 || pairs2.length === 0) { skipped.push(spec.category); continue; }
    for (let i = 0; i < spec.count; i++) {
      games.push({
        category: spec.category,
        slotNumber: i + 1,
        team1Player1Id: pairs1[i]![0],
        team1Player2Id: pairs1[i]![1],
        team2Player1Id: pairs2[i]![0],
        team2Player2Id: pairs2[i]![1],
      });
    }
  }

  if (composition.xd > 0) {
    const male1 = byGender(team1Roster, 'male');
    const female1 = byGender(team1Roster, 'female');
    const male2 = byGender(team2Roster, 'male');
    const female2 = byGender(team2Roster, 'female');
    const pairs1 = pairMixedByLevel(male1, female1, composition.xd);
    const pairs2 = pairMixedByLevel(male2, female2, composition.xd);
    if (pairs1.length === 0 || pairs2.length === 0) {
      skipped.push('XD');
    } else {
      for (let i = 0; i < composition.xd; i++) {
        games.push({
          category: 'XD',
          slotNumber: i + 1,
          team1Player1Id: pairs1[i]![0],
          team1Player2Id: pairs1[i]![1],
          team2Player1Id: pairs2[i]![0],
          team2Player2Id: pairs2[i]![1],
        });
      }
    }
  }

  return { games, skipped };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/tournament.test.ts`
Expected: PASS — all tests in the file, including the new `buildTeamMatchGames` block, pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/tournament.ts src/__tests__/tournament.test.ts
git commit -m "feat(tournament): add buildTeamMatchGames for gender/level-aware rubber assignment"
```

---

### Task 3: Wire `buildTeamMatchGames` into the team-match generation IPC handler

**Files:**
- Modify: `src/main/ipc.ts:6-14` (imports)
- Modify: `src/main/ipc.ts:772-797` (`insertTournamentMatch`)
- Modify: `src/main/ipc.ts:930-1003` (`tournament:teamMatches:generate` handler)

- [ ] **Step 1: Import the new symbols**

In `src/main/ipc.ts`, change:

```ts
import {
  buildNextKnockoutMatches,
  computeTournamentStandings,
  generateKnockoutMatches,
  generateRoundRobinMatches,
  validateTournamentRegistration,
  type TournamentMatchRecord,
  type TournamentRegistration,
} from './tournament';
```

to:

```ts
import {
  buildNextKnockoutMatches,
  buildTeamMatchGames,
  computeTournamentStandings,
  generateKnockoutMatches,
  generateRoundRobinMatches,
  validateTournamentRegistration,
  type TeamMatchComposition,
  type TournamentMatchRecord,
  type TournamentRegistration,
} from './tournament';
```

- [ ] **Step 2: Let `insertTournamentMatch` accept `category`/`slotNumber`**

In `src/main/ipc.ts`, change:

```ts
  function insertTournamentMatch(match: TournamentMatchRecord & { teamMatchId?: string | null }) {
    run(
      `INSERT INTO tournament_matches (
        id, tournamentId, round, matchNumber, courtNumber, status,
        team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id,
        team1Score, team2Score, winner, completedAt, teamMatchId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        match.id,
        match.tournamentId,
        match.round,
        match.matchNumber,
        match.courtNumber,
        match.status,
        match.team1Player1Id,
        match.team1Player2Id,
        match.team2Player1Id,
        match.team2Player2Id,
        match.team1Score,
        match.team2Score,
        match.winner,
        match.completedAt,
        match.teamMatchId ?? null,
      ],
    );
  }
```

to:

```ts
  function insertTournamentMatch(match: TournamentMatchRecord & { teamMatchId?: string | null; category?: string | null; slotNumber?: number | null }) {
    run(
      `INSERT INTO tournament_matches (
        id, tournamentId, round, matchNumber, courtNumber, status,
        team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id,
        team1Score, team2Score, winner, completedAt, teamMatchId, category, slotNumber
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        match.id,
        match.tournamentId,
        match.round,
        match.matchNumber,
        match.courtNumber,
        match.status,
        match.team1Player1Id,
        match.team1Player2Id,
        match.team2Player1Id,
        match.team2Player2Id,
        match.team1Score,
        match.team2Score,
        match.winner,
        match.completedAt,
        match.teamMatchId ?? null,
        match.category ?? null,
        match.slotNumber ?? null,
      ],
    );
  }
```

- [ ] **Step 3: Rewrite the generate handler**

In `src/main/ipc.ts`, replace the entire `ipcMain.handle('tournament:teamMatches:generate', ...)` block (currently lines 930-1003) with:

```ts
  ipcMain.handle('tournament:teamMatches:generate', (_e, tournamentId: string, composition: TeamMatchComposition) => {
    return transaction(() => {
      // Clear existing team matches and their linked individual games
      run('DELETE FROM tournament_matches WHERE tournamentId = ? AND teamMatchId IS NOT NULL', [tournamentId]);
      run('DELETE FROM tournament_team_matches WHERE tournamentId = ?', [tournamentId]);

      const teams = queryAll<{ id: string; name: string }>(
        'SELECT id, name FROM tournament_teams WHERE tournamentId = ? ORDER BY createdAt',
        [tournamentId]
      );
      if (teams.length < 2) return { teamMatches: [], warnings: [] };

      const teamNameById = new Map(teams.map(t => [t.id, t.name]));
      const totalCount = composition.ms + composition.ws + composition.md + composition.xd + composition.wd;
      const warnings: string[] = [];

      // Berger round-robin schedule
      const n = teams.length % 2 === 0 ? teams.length : teams.length + 1;
      const list = teams.map(t => t.id);
      if (teams.length % 2 !== 0) list.push('BYE');

      const teamMatches: Array<{ id: string; round: number; team1Id: string; team2Id: string }> = [];
      const now = new Date().toISOString();

      for (let r = 0; r < n - 1; r++) {
        for (let i = 0; i < n / 2; i++) {
          const a = list[i]!;
          const b = list[n - 1 - i]!;
          if (a !== 'BYE' && b !== 'BYE') {
            const tmId = uuid();
            run(
              `INSERT INTO tournament_team_matches (
                id, tournamentId, round, team1Id, team2Id, gamesPerMatch,
                msCount, wsCount, mdCount, xdCount, wdCount, createdAt
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [tmId, tournamentId, r + 1, a, b, totalCount, composition.ms, composition.ws, composition.md, composition.xd, composition.wd, now]
            );
            teamMatches.push({ id: tmId, round: r + 1, team1Id: a, team2Id: b });
          }
        }
        // Rotate: fix last element, rotate rest
        const fixed = list[n - 1]!;
        const rotating = list.slice(0, n - 1);
        rotating.unshift(rotating.pop()!);
        list.splice(0, n - 1, ...rotating);
        list[n - 1] = fixed;
      }

      // Generate individual rubbers for each team match
      for (const tm of teamMatches) {
        const team1Roster = queryAll<{ playerId: string; gender: 'male' | 'female'; level: number }>(
          `SELECT tp.playerId, p.gender, p.level
           FROM tournament_team_players tp JOIN players p ON tp.playerId = p.id
           WHERE tp.teamId = ? ORDER BY tp.position`, [tm.team1Id]
        );
        const team2Roster = queryAll<{ playerId: string; gender: 'male' | 'female'; level: number }>(
          `SELECT tp.playerId, p.gender, p.level
           FROM tournament_team_players tp JOIN players p ON tp.playerId = p.id
           WHERE tp.teamId = ? ORDER BY tp.position`, [tm.team2Id]
        );

        const { games, skipped } = buildTeamMatchGames(team1Roster, team2Roster, composition);
        for (const category of skipped) {
          warnings.push(`${teamNameById.get(tm.team1Id)} vs ${teamNameById.get(tm.team2Id)}: not enough eligible players for ${category}, skipped`);
        }

        games.forEach((game, index) => {
          insertTournamentMatch({
            id: uuid(),
            tournamentId,
            round: `R${tm.round}`,
            matchNumber: index + 1,
            courtNumber: null,
            status: 'pending',
            team1Player1Id: game.team1Player1Id,
            team1Player2Id: game.team1Player2Id,
            team2Player1Id: game.team2Player1Id,
            team2Player2Id: game.team2Player2Id,
            team1Score: null,
            team2Score: null,
            winner: null,
            completedAt: null,
            teamMatchId: tm.id,
            category: game.category,
            slotNumber: game.slotNumber,
          } as any);
        });
      }

      return { teamMatches, warnings };
    });
  });
```

Note the `totalCount` is stored in the pre-existing `gamesPerMatch` column so any other code reading it still gets a meaningful number (the sum of the composition), and the composition itself is stored in the five new columns.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat(ipc): generate team-match rubbers from a 5-category composition"
```

---

### Task 4: Add the player-reassignment ("fine-tuning") IPC handler

**Files:**
- Modify: `src/main/ipc.ts` (add a new handler after `tournament:teamMatches:generate`, before `tournament:teamMatches:list`)

- [ ] **Step 1: Add the handler and its validation helper**

In `src/main/ipc.ts`, insert this new handler and helper function immediately after the closing `});` of `tournament:teamMatches:generate` (added in Task 3) and before `ipcMain.handle('tournament:teamMatches:list', ...)`:

```ts
  function validateTeamReassignment(
    category: string,
    team1Id: string,
    team2Id: string,
    assignment: { team1Player1Id: string; team1Player2Id: string | null; team2Player1Id: string; team2Player2Id: string | null },
  ) {
    const needsDoubles = category === 'MD' || category === 'WD' || category === 'XD';
    if (needsDoubles) {
      if (!assignment.team1Player2Id || !assignment.team2Player2Id) throw new Error(`${category} requires two players per side`);
      if (assignment.team1Player1Id === assignment.team1Player2Id) throw new Error('Team 1 pair must be two different players');
      if (assignment.team2Player1Id === assignment.team2Player2Id) throw new Error('Team 2 pair must be two different players');
    } else if (assignment.team1Player2Id || assignment.team2Player2Id) {
      throw new Error(`${category} is a singles category and cannot have a second player`);
    }

    const genderOf = (playerId: string): string | undefined =>
      queryOne<{ gender: string }>('SELECT gender FROM players WHERE id = ?', [playerId])?.gender;
    const isTeamMember = (teamId: string, playerId: string): boolean =>
      Boolean(queryOne('SELECT 1 FROM tournament_team_players WHERE teamId = ? AND playerId = ?', [teamId, playerId]));

    const checkSlot = (teamId: string, playerId: string, requiredGender: 'male' | 'female') => {
      if (!isTeamMember(teamId, playerId)) throw new Error('Selected player is not on this team');
      if (genderOf(playerId) !== requiredGender) throw new Error(`${category} requires a ${requiredGender} player in this slot`);
    };

    if (category === 'MS' || category === 'MD') {
      checkSlot(team1Id, assignment.team1Player1Id, 'male');
      checkSlot(team2Id, assignment.team2Player1Id, 'male');
      if (assignment.team1Player2Id) checkSlot(team1Id, assignment.team1Player2Id, 'male');
      if (assignment.team2Player2Id) checkSlot(team2Id, assignment.team2Player2Id, 'male');
    } else if (category === 'WS' || category === 'WD') {
      checkSlot(team1Id, assignment.team1Player1Id, 'female');
      checkSlot(team2Id, assignment.team2Player1Id, 'female');
      if (assignment.team1Player2Id) checkSlot(team1Id, assignment.team1Player2Id, 'female');
      if (assignment.team2Player2Id) checkSlot(team2Id, assignment.team2Player2Id, 'female');
    } else if (category === 'XD') {
      checkSlot(team1Id, assignment.team1Player1Id, 'male');
      checkSlot(team2Id, assignment.team2Player1Id, 'male');
      checkSlot(team1Id, assignment.team1Player2Id!, 'female');
      checkSlot(team2Id, assignment.team2Player2Id!, 'female');
    }
  }

  ipcMain.handle('tournament:teamMatches:reassignPlayers', (_e, gameId: string, assignment: {
    team1Player1Id: string;
    team1Player2Id: string | null;
    team2Player1Id: string;
    team2Player2Id: string | null;
  }) => {
    const game = queryOne<{ status: string; category: string | null; teamMatchId: string | null }>(
      'SELECT status, category, teamMatchId FROM tournament_matches WHERE id = ?', [gameId]
    );
    if (!game) throw new Error('Match not found');
    if (game.status !== 'pending') throw new Error('Cannot reassign players on a match that has already started');
    if (!game.teamMatchId || !game.category) throw new Error('Not a team match rubber');

    const teamMatch = queryOne<{ team1Id: string; team2Id: string }>(
      'SELECT team1Id, team2Id FROM tournament_team_matches WHERE id = ?', [game.teamMatchId]
    );
    if (!teamMatch) throw new Error('Team match not found');

    validateTeamReassignment(game.category, teamMatch.team1Id, teamMatch.team2Id, assignment);

    run(
      'UPDATE tournament_matches SET team1Player1Id = ?, team1Player2Id = ?, team2Player1Id = ?, team2Player2Id = ? WHERE id = ?',
      [assignment.team1Player1Id, assignment.team1Player2Id, assignment.team2Player1Id, assignment.team2Player2Id, gameId]
    );
  });
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat(ipc): add tournament:teamMatches:reassignPlayers for fine-tuning rubber lineups"
```

---

### Task 5: Update the preload bridge types

**Files:**
- Modify: `src/main/preload.ts:109` (`tournamentTeamMatchesGenerate`)
- Modify: `src/main/preload.ts` (add `tournamentTeamMatchesReassignPlayers` after `tournamentTeamMatchesSetScore`)

- [ ] **Step 1: Update the generate signature and add the reassign method**

In `src/main/preload.ts`, change:

```ts
  tournamentTeamMatchesGenerate: (tournamentId: string, gamesPerMatch?: number) => ipcRenderer.invoke('tournament:teamMatches:generate', tournamentId, gamesPerMatch),
```

to:

```ts
  tournamentTeamMatchesGenerate: (tournamentId: string, composition: { ms: number; ws: number; md: number; xd: number; wd: number }) => ipcRenderer.invoke('tournament:teamMatches:generate', tournamentId, composition),
```

Then, immediately after this existing line:

```ts
  tournamentTeamMatchesSetScore: (gameId: string, team1Score: number, team2Score: number) => ipcRenderer.invoke('tournament:teamMatches:setScore', gameId, team1Score, team2Score),
```

add:

```ts
  tournamentTeamMatchesReassignPlayers: (gameId: string, assignment: { team1Player1Id: string; team1Player2Id: string | null; team2Player1Id: string; team2Player2Id: string | null }) => ipcRenderer.invoke('tournament:teamMatches:reassignPlayers', gameId, assignment),
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/preload.ts
git commit -m "feat(preload): expose composition-based generate and reassignPlayers APIs"
```

---

### Task 6: Renderer — 5-input composition form for generating team matches

**Files:**
- Modify: `src/renderer/pages/TournamentDetail.tsx:141` (state)
- Modify: `src/renderer/pages/TournamentDetail.tsx:264-276` (`handleGenerateTeamMatches`)
- Modify: `src/renderer/pages/TournamentDetail.tsx:566-593` (generate modal JSX)

- [ ] **Step 1: Replace the `gamesPerMatch` state with a composition object**

In `src/renderer/pages/TournamentDetail.tsx`, change:

```tsx
  const [gamesPerMatch, setGamesPerMatch] = useState('3');
```

to:

```tsx
  const [composition, setComposition] = useState({ ms: '2', ws: '2', md: '2', xd: '2', wd: '1' });
```

- [ ] **Step 2: Update `handleGenerateTeamMatches`**

Change:

```tsx
  const handleGenerateTeamMatches = async () => {
    if (!id) return;
    setTeamError(null);
    const n = parseInt(gamesPerMatch) || 3;
    setBusyAction('generateTeam');
    try {
      await (window.api as any).tournamentTeamMatchesGenerate(id, n);
      setShowGenerateTeam(false);
      setTab('bracket');
      await load();
    } catch (err: any) { setTeamError(err?.message ?? 'Failed to generate matches'); }
    finally { setBusyAction(null); }
  };
```

to:

```tsx
  const handleGenerateTeamMatches = async () => {
    if (!id) return;
    setTeamError(null);
    const parsed = {
      ms: parseInt(composition.ms) || 0,
      ws: parseInt(composition.ws) || 0,
      md: parseInt(composition.md) || 0,
      xd: parseInt(composition.xd) || 0,
      wd: parseInt(composition.wd) || 0,
    };
    setBusyAction('generateTeam');
    try {
      const result = await (window.api as any).tournamentTeamMatchesGenerate(id, parsed) as { warnings: string[] };
      setShowGenerateTeam(false);
      setTab('bracket');
      await load();
      if (result.warnings.length > 0) setTeamError(result.warnings.join(' | '));
    } catch (err: any) { setTeamError(err?.message ?? 'Failed to generate matches'); }
    finally { setBusyAction(null); }
  };
```

- [ ] **Step 3: Replace the modal's single number picker with 5 labeled inputs**

Change:

```tsx
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Games per team match</label>
                  <div className="flex gap-2 mb-4">
                    {['1', '3', '5'].map(n => (
                      <button key={n} onClick={() => setGamesPerMatch(n)}
                        className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-all ${gamesPerMatch === n ? 'bg-zinc-800 border-zinc-900 text-white' : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}>
                        {n}
                      </button>
                    ))}
                    <input type="number" min="1" max="9" value={gamesPerMatch} onChange={e => setGamesPerMatch(e.target.value)}
                      className="w-16 px-2 text-sm text-center border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400" />
                  </div>
```

to:

```tsx
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Rubber composition</label>
                  <div className="space-y-2 mb-4">
                    {([
                      ['ms', "Men's Singles"],
                      ['ws', "Women's Singles"],
                      ['md', "Men's Doubles"],
                      ['xd', 'Mixed Doubles'],
                      ['wd', "Women's Doubles"],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-zinc-600">{label}</span>
                        <input type="number" min="0" max="9" value={composition[key]}
                          onChange={e => setComposition({ ...composition, [key]: e.target.value })}
                          className="w-16 px-2 py-1 text-sm text-center border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400" />
                      </div>
                    ))}
                  </div>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/TournamentDetail.tsx
git commit -m "feat(tournament-detail): replace single games-per-match input with 5-category composition form"
```

---

### Task 7: Renderer — category badge on rubber cards

**Files:**
- Modify: `src/renderer/pages/TournamentDetail.tsx:21-42` (`MatchRow` interface)
- Modify: `src/renderer/pages/TournamentDetail.tsx:650-663` (bracket tab card header)

- [ ] **Step 1: Add the new fields to `MatchRow`**

In `src/renderer/pages/TournamentDetail.tsx`, change:

```tsx
interface MatchRow {
  id: string;
  round: string;
  matchNumber: number;
  courtNumber: number | null;
  status: 'pending' | 'in_progress' | 'completed';
  team1Player1Id: string;
  team1Player2Id: string | null;
  team2Player1Id: string;
  team2Player2Id: string | null;
  team1Score: number | null;
  team2Score: number | null;
  winner: 'team1' | 'team2' | null;
  t1p1Name: string;
  t1p1Level: number;
  t1p2Name: string | null;
  t1p2Level: number | null;
  t2p1Name: string;
  t2p1Level: number;
  t2p2Name: string | null;
  t2p2Level: number | null;
}
```

to:

```tsx
interface MatchRow {
  id: string;
  round: string;
  matchNumber: number;
  courtNumber: number | null;
  status: 'pending' | 'in_progress' | 'completed';
  team1Player1Id: string;
  team1Player2Id: string | null;
  team2Player1Id: string;
  team2Player2Id: string | null;
  team1Score: number | null;
  team2Score: number | null;
  winner: 'team1' | 'team2' | null;
  t1p1Name: string;
  t1p1Level: number;
  t1p2Name: string | null;
  t1p2Level: number | null;
  t2p1Name: string;
  t2p1Level: number;
  t2p2Name: string | null;
  t2p2Level: number | null;
  teamMatchId: string | null;
  category: 'MS' | 'WS' | 'MD' | 'XD' | 'WD' | null;
  slotNumber: number | null;
}
```

- [ ] **Step 2: Show the badge on the card**

In `src/renderer/pages/TournamentDetail.tsx`, change:

```tsx
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-semibold text-zinc-400 uppercase">{bye ? 'Auto-advance' : `Court ${m.courtNumber ?? '—'}`}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${m.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : m.status === 'in_progress' ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-500'}`}>{m.status}</span>
                            {!bye && (
                              <button onClick={() => setScoreMatch(m)}
                                className="h-6 px-2 text-[11px] font-semibold text-zinc-700 border border-zinc-200 rounded-md hover:bg-zinc-50 active:scale-[0.97] transition-all">
                                {m.status === 'completed' ? 'Edit Score' : 'Enter Score'}
                              </button>
                            )}
                          </div>
                        </div>
```

to:

```tsx
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-zinc-400 uppercase">{bye ? 'Auto-advance' : `Court ${m.courtNumber ?? '—'}`}</span>
                            {m.category && (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                                {m.category}{m.slotNumber}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${m.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : m.status === 'in_progress' ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-500'}`}>{m.status}</span>
                            {!bye && m.category && m.status === 'pending' && (
                              <button onClick={() => setEditPlayersMatch(m)}
                                className="h-6 px-2 text-[11px] font-semibold text-zinc-700 border border-zinc-200 rounded-md hover:bg-zinc-50 active:scale-[0.97] transition-all">
                                Edit Players
                              </button>
                            )}
                            {!bye && (
                              <button onClick={() => setScoreMatch(m)}
                                className="h-6 px-2 text-[11px] font-semibold text-zinc-700 border border-zinc-200 rounded-md hover:bg-zinc-50 active:scale-[0.97] transition-all">
                                {m.status === 'completed' ? 'Edit Score' : 'Enter Score'}
                              </button>
                            )}
                          </div>
                        </div>
```

Note: `setEditPlayersMatch` is added in Task 8 — this task will not typecheck cleanly on its own until Task 8 adds that state. That's fine; do Task 7 and Task 8 as one continuous work session before running the typecheck/commit steps, OR (simpler) do Task 8 first if executing out of order. **Recommended: execute Task 8 immediately after this step, before typechecking, since they touch the same render block.**

- [ ] **Step 3: (Deferred to Task 8) Typecheck and commit happen together — see Task 8's Step 4.**

---

### Task 8: Renderer — "Edit Players" fine-tune modal

**Files:**
- Modify: `src/renderer/pages/TournamentDetail.tsx` (add state, a new `EditPlayersModal` component, and render it)

- [ ] **Step 1: Add state for the modal**

In `src/renderer/pages/TournamentDetail.tsx`, find:

```tsx
  const [scoreMatch, setScoreMatch] = useState<MatchRow | null>(null);
```

and add immediately after it:

```tsx
  const [editPlayersMatch, setEditPlayersMatch] = useState<MatchRow | null>(null);
```

- [ ] **Step 2: Add the `EditPlayersModal` component**

In `src/renderer/pages/TournamentDetail.tsx`, add this new component immediately before `export function TournamentDetail()`:

```tsx
function EditPlayersModal({ match, team1Id, team2Id, onClose, onSaved }: {
  match: MatchRow;
  team1Id: string;
  team2Id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isDoubles = match.category === 'MD' || match.category === 'WD' || match.category === 'XD';
  const [team1Players, setTeam1Players] = useState<any[]>([]);
  const [team2Players, setTeam2Players] = useState<any[]>([]);
  const [t1p1, setT1p1] = useState(match.team1Player1Id);
  const [t1p2, setT1p2] = useState(match.team1Player2Id ?? '');
  const [t2p1, setT2p1] = useState(match.team2Player1Id);
  const [t2p2, setT2p2] = useState(match.team2Player2Id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (window.api as any).tournamentTeamsListPlayers(team1Id).then(setTeam1Players);
    (window.api as any).tournamentTeamsListPlayers(team2Id).then(setTeam2Players);
  }, [team1Id, team2Id]);

  const genderFor = (category: string, slot: 1 | 2): 'male' | 'female' => {
    if (category === 'MS' || category === 'MD') return 'male';
    if (category === 'WS' || category === 'WD') return 'female';
    return slot === 1 ? 'male' : 'female'; // XD
  };

  const optionsFor = (players: any[], category: string, slot: 1 | 2) =>
    players.filter(p => p.gender === genderFor(category, slot));

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await (window.api as any).tournamentTeamMatchesReassignPlayers(match.id, {
        team1Player1Id: t1p1,
        team1Player2Id: isDoubles ? (t1p2 || null) : null,
        team2Player1Id: t2p1,
        team2Player2Id: isDoubles ? (t2p2 || null) : null,
      });
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to reassign players');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-[420px] max-w-[90vw]" onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 24px 48px -12px rgba(0,0,0,0.2)', animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <h3 className="text-lg font-bold text-zinc-900 mb-4">Edit Players — {match.category}{match.slotNumber}</h3>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1">Team 1</label>
            <select value={t1p1} onChange={e => setT1p1(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl mb-2">
              {optionsFor(team1Players, match.category!, 1).map(p => <option key={p.playerId} value={p.playerId}>{p.name}</option>)}
            </select>
            {isDoubles && (
              <select value={t1p2} onChange={e => setT1p2(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl">
                {optionsFor(team1Players, match.category!, 2).map(p => <option key={p.playerId} value={p.playerId}>{p.name}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1">Team 2</label>
            <select value={t2p1} onChange={e => setT2p1(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl mb-2">
              {optionsFor(team2Players, match.category!, 1).map(p => <option key={p.playerId} value={p.playerId}>{p.name}</option>)}
            </select>
            {isDoubles && (
              <select value={t2p2} onChange={e => setT2p2(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl">
                {optionsFor(team2Players, match.category!, 2).map(p => <option key={p.playerId} value={p.playerId}>{p.name}</option>)}
              </select>
            )}
          </div>
        </div>
        {error && <p className="mb-3 text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 rounded-xl">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm font-semibold bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 active:scale-[0.97] transition-all disabled:opacity-40">Save</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Render the modal and pass the right team IDs**

The modal needs each rubber's `team1Id`/`team2Id` (from its parent `tournament_team_matches` row), which isn't on `MatchRow` — but `teamMatches` (loaded via `tournamentTeamMatchesList`) already has `team1Id`/`team2Id` per `teamMatchId`. Find where `teamMatches` state would need to be added — check first whether it already exists in `TournamentDetail.tsx` (search for `tournamentTeamMatchesList`). If it does not exist yet, add it:

Find:

```tsx
  const load = useCallback(async () => {
    if (!id) return;
    const [t, r, p, s, tms, ts] = await Promise.all([
      window.api.tournamentsGet(id) as Promise<TourData>,
      window.api.tournamentsRegistrations(id) as Promise<RegRow[]>,
      window.api.playersList() as Promise<any[]>,
      window.api.tournamentsStandings(id) as Promise<StandingRow[]>,
      (window.api as any).tournamentTeamsList(id) as Promise<any[]>,
      (window.api as any).tournamentTeamsStandings(id) as Promise<any[]>,
    ]);
    setData(t); setRegs(r); setPlayers(p); setStandings(s);
    setTeams(tms); setTeamStandings(ts);
    setLoading(false);
  }, [id]);
```

and replace with (adds a 7th parallel fetch for the team-match list, and its own state):

```tsx
  const load = useCallback(async () => {
    if (!id) return;
    const [t, r, p, s, tms, ts, tmatches] = await Promise.all([
      window.api.tournamentsGet(id) as Promise<TourData>,
      window.api.tournamentsRegistrations(id) as Promise<RegRow[]>,
      window.api.playersList() as Promise<any[]>,
      window.api.tournamentsStandings(id) as Promise<StandingRow[]>,
      (window.api as any).tournamentTeamsList(id) as Promise<any[]>,
      (window.api as any).tournamentTeamsStandings(id) as Promise<any[]>,
      (window.api as any).tournamentTeamMatchesList(id) as Promise<any[]>,
    ]);
    setData(t); setRegs(r); setPlayers(p); setStandings(s);
    setTeams(tms); setTeamStandings(ts); setTeamMatches(tmatches);
    setLoading(false);
  }, [id]);
```

Add the new state near the other team-tournament state (next to `const [teams, setTeams] = useState<any[]>([]);`):

```tsx
  const [teamMatches, setTeamMatches] = useState<any[]>([]);
```

Then render the modal at the bottom of the component, next to the existing `{scoreMatch && <ScoreModal .../>}` line:

```tsx
      {scoreMatch && <ScoreModal match={scoreMatch} onClose={() => setScoreMatch(null)} onSaved={() => { setScoreMatch(null); load(); }} />}
      {editPlayersMatch && (() => {
        const tm = teamMatches.find((t: any) => t.id === editPlayersMatch.teamMatchId);
        if (!tm) return null;
        return (
          <EditPlayersModal
            match={editPlayersMatch}
            team1Id={tm.team1Id}
            team2Id={tm.team2Id}
            onClose={() => setEditPlayersMatch(null)}
            onSaved={() => { setEditPlayersMatch(null); load(); }}
          />
        );
      })()}
```

- [ ] **Step 4: Typecheck (covers both Task 7 and Task 8)**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit (covers both Task 7 and Task 8)**

```bash
git add src/renderer/pages/TournamentDetail.tsx
git commit -m "feat(tournament-detail): add rubber category badges and an Edit Players fine-tune modal"
```

---

### Task 9: e2e regression test for the full flow

**Files:**
- Create: `e2e/teamTournamentComposition.spec.ts`

- [ ] **Step 1: Write the e2e test**

Create `e2e/teamTournamentComposition.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the e2e test**

Run: `npm run build && npx playwright test e2e/teamTournamentComposition.spec.ts`
Expected: build succeeds, both tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/teamTournamentComposition.spec.ts
git commit -m "test(e2e): cover team-match composition generation and player reassignment"
```

---

### Task 10: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Unit tests**

Run: `npm test`
Expected: all tests pass, including the new `buildTeamMatchGames` suite from Task 2.

- [ ] **Step 3: Full e2e suite**

Run: `npm run build && npx playwright test`
Expected: all specs pass except the known pre-existing, unrelated `v1.0.0` version-string failure in `e2e/dashboard.spec.ts`. No other new failures — in particular, confirm `e2e/tournament.spec.ts`'s existing team-tournament tests (which call `tournamentTeamMatchesGenerate` with the *old* `(tournamentId, gamesPerMatch: number)` signature — none currently exist per a check of that file, but re-verify) still pass, since Task 3 changed that function's parameter shape from a number to an object.

- [ ] **Step 4: Manually verify the composition form and Edit Players modal render correctly**

Reuse the pattern from prior demo/verification scripts in this repo (`_electron.launch()` + navigate to a tournament's Teams tab, open "Generate Team Matches", screenshot). Confirm: 5 labeled number inputs with defaults 2/2/2/2/1, category badges like "MS1"/"MD2" on bracket cards, and the "Edit Players" modal opens with gender-filtered dropdowns when clicked on a pending rubber.

---

## Self-Review Notes

- **Spec coverage:** composition input (Task 6) ✓, gender+level-aware auto-assignment (Task 2) ✓, per-tie skip + warnings (Task 2 + 3) ✓, category/slot labeling (Task 7) ✓, fine-tune reassignment with gender validation (Task 4 + 8) ✓, schema changes (Task 1) ✓, unit + e2e testing (Task 2 + 9) ✓, out-of-scope `TournamentLivePanel.tsx` explicitly called out rather than silently ignored ✓.
- **No placeholders:** every step has literal code; the one deliberately-deferred item (`TournamentLivePanel.tsx` category badges) is explicitly named as a follow-up, not glossed over.
- **Type/name consistency:** `TeamMatchComposition`, `TeamMatchGameSpec`, `TeamMatchCategory`, `BuildTeamMatchGamesResult` are defined once in Task 2 and reused with identical names/shapes in Tasks 3, 4, 5, 6, 7, 8. `buildTeamMatchGames`'s return shape (`{ games, skipped }`) matches what Task 3's handler destructures. The renderer's `composition` state field names (`ms`/`ws`/`md`/`xd`/`wd`) match `TeamMatchComposition`'s fields exactly, so `parseInt(composition.ms)` etc. line up with what `tournamentTeamMatchesGenerate` expects.
