# Team Match Composition (MS/WS/MD/XD/WD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the team round-robin's single `gamesPerMatch` number with a configurable 5-category rubber composition (Men's Singles / Women's Singles / Men's Doubles / Mixed Doubles / Women's Doubles), auto-assign players by gender with level-based doubles pairing, label each generated rubber by category, and let organizers fine-tune (swap) player assignments before a rubber is played.

**Architecture:** A new pure function `buildTeamMatchGames` in `src/main/tournament.ts` (alongside the existing `generateKnockoutMatches`/`generateRoundRobinMatches`) computes, for one team-vs-team tie, which players play which rubber given each team's roster and the composition. `src/main/ipc.ts`'s `tournament:teamMatches:generate` handler is rewired to call it per Berger-schedule tie instead of its current generic-singles loop, and a new `tournament:teamMatches:reassignPlayers` handler lets the renderer swap a not-yet-played rubber's players. Two new nullable columns (`category`, `slotNumber`) are added to `tournament_matches` so any rubber can be labeled; two team-match-record columns become five (`msCount`/`wsCount`/`mdCount`/`xdCount`/`wdCount`) so the composition used for a tie is stored. The renderer (`TournamentDetail.tsx`) gets a 5-input composition form instead of one number, a category badge on rubber cards, and an "Edit Players" modal for fine-tuning.

**Tech Stack:** Electron main process (SQLite via sql.js), TypeScript, React 19, Tailwind CSS 4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-12-team-match-composition-design.md`

**Note on `TournamentLivePanel.tsx`:** this file (route `/tournaments/:id/live`, the screen organizers actually run live court assignment/scoring from) was not covered by the original spec review. An advisor pass on this plan found that it's not just missing category badges — its `Game` interface and backing query have no second-player fields at all, so once doubles rubbers exist, this screen would silently show only one player per side for MD/WD/XD ties, hiding the partner. Task 9 (below) fixes this as part of this plan rather than deferring it, since it's the primary live-ops surface for the whole feature.

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
  validateTeamReassignment,
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

describe('validateTeamReassignment', () => {
  const team1 = [rosterPlayer('t1-m1', 'male', 3), rosterPlayer('t1-m2', 'male', 4), rosterPlayer('t1-f1', 'female', 3)];
  const team2 = [rosterPlayer('t2-m1', 'male', 3), rosterPlayer('t2-f1', 'female', 3), rosterPlayer('t2-f2', 'female', 4)];

  it('accepts a valid singles reassignment', () => {
    expect(() => validateTeamReassignment('MS', team1, team2, {
      team1Player1Id: 't1-m2', team1Player2Id: null, team2Player1Id: 't2-m1', team2Player2Id: null,
    })).not.toThrow();
  });

  it('rejects a singles category given a second player', () => {
    expect(() => validateTeamReassignment('MS', team1, team2, {
      team1Player1Id: 't1-m1', team1Player2Id: 't1-m2', team2Player1Id: 't2-m1', team2Player2Id: null,
    })).toThrow('singles category');
  });

  it('rejects a doubles category missing a second player', () => {
    expect(() => validateTeamReassignment('MD', team1, team2, {
      team1Player1Id: 't1-m1', team1Player2Id: null, team2Player1Id: 't2-m1', team2Player2Id: null,
    })).toThrow('requires two players');
  });

  it('rejects a player not on the roster for that side', () => {
    expect(() => validateTeamReassignment('MS', team1, team2, {
      team1Player1Id: 'not-on-any-team', team1Player2Id: null, team2Player1Id: 't2-m1', team2Player2Id: null,
    })).toThrow('not on this team');
  });

  it('rejects a gender mismatch for the category', () => {
    expect(() => validateTeamReassignment('MS', team1, team2, {
      team1Player1Id: 't1-f1', team1Player2Id: null, team2Player1Id: 't2-m1', team2Player2Id: null,
    })).toThrow('requires a male player');
  });

  it('rejects a mixed-doubles pair with two players of the same gender', () => {
    expect(() => validateTeamReassignment('XD', team1, team2, {
      team1Player1Id: 't1-m1', team1Player2Id: 't1-m2', team2Player1Id: 't2-m1', team2Player2Id: 't2-f1',
    })).toThrow('requires a female player');
  });

  it('accepts a valid mixed-doubles reassignment', () => {
    expect(() => validateTeamReassignment('XD', team1, team2, {
      team1Player1Id: 't1-m1', team1Player2Id: 't1-f1', team2Player1Id: 't2-m1', team2Player2Id: 't2-f1',
    })).not.toThrow();
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

export interface TeamReassignmentInput {
  team1Player1Id: string;
  team1Player2Id: string | null;
  team2Player1Id: string;
  team2Player2Id: string | null;
}

export function validateTeamReassignment(
  category: TeamMatchCategory,
  team1Roster: TeamRosterPlayer[],
  team2Roster: TeamRosterPlayer[],
  assignment: TeamReassignmentInput,
): void {
  const needsDoubles = category === 'MD' || category === 'WD' || category === 'XD';
  if (needsDoubles) {
    if (!assignment.team1Player2Id || !assignment.team2Player2Id) throw new Error(`${category} requires two players per side`);
    if (assignment.team1Player1Id === assignment.team1Player2Id) throw new Error('Team 1 pair must be two different players');
    if (assignment.team2Player1Id === assignment.team2Player2Id) throw new Error('Team 2 pair must be two different players');
  } else if (assignment.team1Player2Id || assignment.team2Player2Id) {
    throw new Error(`${category} is a singles category and cannot have a second player`);
  }

  const findPlayer = (roster: TeamRosterPlayer[], playerId: string) => roster.find(p => p.playerId === playerId);

  const checkSlot = (roster: TeamRosterPlayer[], playerId: string, requiredGender: 'male' | 'female') => {
    const player = findPlayer(roster, playerId);
    if (!player) throw new Error('Selected player is not on this team');
    if (player.gender !== requiredGender) throw new Error(`${category} requires a ${requiredGender} player in this slot`);
  };

  if (category === 'MS' || category === 'MD') {
    checkSlot(team1Roster, assignment.team1Player1Id, 'male');
    checkSlot(team2Roster, assignment.team2Player1Id, 'male');
    if (assignment.team1Player2Id) checkSlot(team1Roster, assignment.team1Player2Id, 'male');
    if (assignment.team2Player2Id) checkSlot(team2Roster, assignment.team2Player2Id, 'male');
  } else if (category === 'WS' || category === 'WD') {
    checkSlot(team1Roster, assignment.team1Player1Id, 'female');
    checkSlot(team2Roster, assignment.team2Player1Id, 'female');
    if (assignment.team1Player2Id) checkSlot(team1Roster, assignment.team1Player2Id, 'female');
    if (assignment.team2Player2Id) checkSlot(team2Roster, assignment.team2Player2Id, 'female');
  } else if (category === 'XD') {
    checkSlot(team1Roster, assignment.team1Player1Id, 'male');
    checkSlot(team2Roster, assignment.team2Player1Id, 'male');
    checkSlot(team1Roster, assignment.team1Player2Id!, 'female');
    checkSlot(team2Roster, assignment.team2Player2Id!, 'female');
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/tournament.test.ts`
Expected: PASS — all tests in the file, including the new `buildTeamMatchGames` and `validateTeamReassignment` blocks, pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/tournament.ts src/__tests__/tournament.test.ts
git commit -m "feat(tournament): add buildTeamMatchGames and validateTeamReassignment"
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

`validateTeamReassignment` was already implemented and unit-tested as a pure function in Task 2 (it takes pre-fetched rosters rather than querying the database itself, matching the existing `validateTournamentRegistration` pattern in this codebase). This task is just the thin IO wrapper: fetch the two rosters, call the already-tested validator, write the update.

**Files:**
- Modify: `src/main/ipc.ts` (imports; add a new handler after `tournament:teamMatches:generate`, before `tournament:teamMatches:list`)

- [ ] **Step 1: Import the new symbols**

In `src/main/ipc.ts`, change the import block left by Task 3:

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

to:

```ts
import {
  buildNextKnockoutMatches,
  buildTeamMatchGames,
  computeTournamentStandings,
  generateKnockoutMatches,
  generateRoundRobinMatches,
  validateTeamReassignment,
  validateTournamentRegistration,
  type TeamMatchCategory,
  type TeamMatchComposition,
  type TeamReassignmentInput,
  type TeamRosterPlayer,
  type TournamentMatchRecord,
  type TournamentRegistration,
} from './tournament';
```

- [ ] **Step 2: Add the handler**

In `src/main/ipc.ts`, insert this new handler immediately after the closing `});` of `tournament:teamMatches:generate` (added in Task 3) and before `ipcMain.handle('tournament:teamMatches:list', ...)`:

```ts
  ipcMain.handle('tournament:teamMatches:reassignPlayers', (_e, gameId: string, assignment: TeamReassignmentInput) => {
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

    const team1Roster = queryAll<TeamRosterPlayer>(
      `SELECT tp.playerId, p.gender, p.level FROM tournament_team_players tp JOIN players p ON tp.playerId = p.id WHERE tp.teamId = ?`,
      [teamMatch.team1Id]
    );
    const team2Roster = queryAll<TeamRosterPlayer>(
      `SELECT tp.playerId, p.gender, p.level FROM tournament_team_players tp JOIN players p ON tp.playerId = p.id WHERE tp.teamId = ?`,
      [teamMatch.team2Id]
    );

    validateTeamReassignment(game.category as TeamMatchCategory, team1Roster, team2Roster, assignment);

    run(
      'UPDATE tournament_matches SET team1Player1Id = ?, team1Player2Id = ?, team2Player1Id = ?, team2Player2Id = ? WHERE id = ?',
      [assignment.team1Player1Id, assignment.team1Player2Id, assignment.team2Player1Id, assignment.team2Player2Id, gameId]
    );
  });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

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

### Task 9: Render doubles partners and category badges in the live court panel

`TournamentLivePanel.tsx` (route `/tournaments/:id/live`) is the screen organizers use to assign rubbers to courts and record scores live. It currently only reads/renders `team1Player1`/`team2Player1` — once doubles rubbers exist (Task 3 onward), this screen would silently hide each doubles pair's second player. This task fixes that.

**Files:**
- Modify: `src/main/ipc.ts` (the `tournament:teamMatches:listGames` query)
- Modify: `src/renderer/pages/TournamentLivePanel.tsx` (the `Game` interface, a new `formatGameSide` helper, and every place a player name/level is rendered)

- [ ] **Step 1: Extend the `listGames` query to include the second player on each side**

In `src/main/ipc.ts`, change:

```ts
  ipcMain.handle('tournament:teamMatches:listGames', (_e, teamMatchId: string) => {
    return queryAll(
      `SELECT tm.*,
         p1.name as team1Player1Name, p1.gender as team1Player1Gender, p1.level as team1Player1Level,
         p2.name as team2Player1Name, p2.gender as team2Player1Gender, p2.level as team2Player1Level
       FROM tournament_matches tm
       JOIN players p1 ON tm.team1Player1Id = p1.id
       JOIN players p2 ON tm.team2Player1Id = p2.id
       WHERE tm.teamMatchId = ?
       ORDER BY tm.matchNumber`,
      [teamMatchId]
    );
  });
```

to:

```ts
  ipcMain.handle('tournament:teamMatches:listGames', (_e, teamMatchId: string) => {
    return queryAll(
      `SELECT tm.*,
         p1.name as team1Player1Name, p1.gender as team1Player1Gender, p1.level as team1Player1Level,
         p1b.name as team1Player2Name, p1b.gender as team1Player2Gender, p1b.level as team1Player2Level,
         p2.name as team2Player1Name, p2.gender as team2Player1Gender, p2.level as team2Player1Level,
         p2b.name as team2Player2Name, p2b.gender as team2Player2Gender, p2b.level as team2Player2Level
       FROM tournament_matches tm
       JOIN players p1 ON tm.team1Player1Id = p1.id
       LEFT JOIN players p1b ON tm.team1Player2Id = p1b.id
       JOIN players p2 ON tm.team2Player1Id = p2.id
       LEFT JOIN players p2b ON tm.team2Player2Id = p2b.id
       WHERE tm.teamMatchId = ?
       ORDER BY tm.matchNumber`,
      [teamMatchId]
    );
  });
```

(`p1b`/`p2b` are `LEFT JOIN` because `team1Player2Id`/`team2Player2Id` are `NULL` for singles rubbers — `tm.*` already carries the raw id columns, including the new `category`/`slotNumber` from Task 1.)

- [ ] **Step 2: Typecheck the main process**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit the backend half**

```bash
git add src/main/ipc.ts
git commit -m "feat(ipc): include doubles partners in team-match game listing"
```

- [ ] **Step 4: Extend the `Game` interface and add a `formatGameSide` helper**

In `src/renderer/pages/TournamentLivePanel.tsx`, change:

```tsx
interface Game {
  id: string;
  teamMatchId: string;
  matchNumber: number;
  courtNumber: number | null;
  status: string;
  team1Player1Id: string; team1Player1Name: string; team1Player1Level: number;
  team2Player1Id: string; team2Player1Name: string; team2Player1Level: number;
  team1Score: number | null; team2Score: number | null;
  winner: string | null;
}
```

to:

```tsx
interface Game {
  id: string;
  teamMatchId: string;
  matchNumber: number;
  courtNumber: number | null;
  status: string;
  team1Player1Id: string; team1Player1Name: string; team1Player1Level: number;
  team1Player2Id: string | null; team1Player2Name: string | null; team1Player2Level: number | null;
  team2Player1Id: string; team2Player1Name: string; team2Player1Level: number;
  team2Player2Id: string | null; team2Player2Name: string | null; team2Player2Level: number | null;
  team1Score: number | null; team2Score: number | null;
  winner: string | null;
  category: 'MS' | 'WS' | 'MD' | 'XD' | 'WD' | null;
  slotNumber: number | null;
}

function formatGameSide(game: Game, side: 'team1' | 'team2'): string {
  if (side === 'team1') {
    return game.team1Player2Name ? `${game.team1Player1Name} / ${game.team1Player2Name}` : game.team1Player1Name;
  }
  return game.team2Player2Name ? `${game.team2Player1Name} / ${game.team2Player2Name}` : game.team2Player1Name;
}
```

- [ ] **Step 5: Use `formatGameSide` in `ScoreModal`**

Change:

```tsx
          <div className="text-center">
            <p className="text-xs font-semibold text-zinc-500 mb-1 truncate">{game.team1Player1Name}</p>
            <input autoFocus type="number" min="0" value={sc1} onChange={e => setSc1(e.target.value)}
              className="w-full text-center text-2xl font-bold px-3 py-2 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400" />
          </div>
          <div className="text-center text-sm font-bold text-zinc-400">vs</div>
          <div className="text-center">
            <p className="text-xs font-semibold text-zinc-500 mb-1 truncate">{game.team2Player1Name}</p>
            <input type="number" min="0" value={sc2} onChange={e => setSc2(e.target.value)}
              className="w-full text-center text-2xl font-bold px-3 py-2 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400" />
          </div>
```

to:

```tsx
          <div className="text-center">
            <p className="text-xs font-semibold text-zinc-500 mb-1 truncate">{formatGameSide(game, 'team1')}</p>
            <input autoFocus type="number" min="0" value={sc1} onChange={e => setSc1(e.target.value)}
              className="w-full text-center text-2xl font-bold px-3 py-2 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400" />
          </div>
          <div className="text-center text-sm font-bold text-zinc-400">vs</div>
          <div className="text-center">
            <p className="text-xs font-semibold text-zinc-500 mb-1 truncate">{formatGameSide(game, 'team2')}</p>
            <input type="number" min="0" value={sc2} onChange={e => setSc2(e.target.value)}
              className="w-full text-center text-2xl font-bold px-3 py-2 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400" />
          </div>
```

- [ ] **Step 6: Use `formatGameSide` in `AssignModal`**

Change:

```tsx
              <p className="text-sm font-semibold text-zinc-800">
                {game.team1Player1Name} <span className="font-normal text-zinc-400">vs</span> {game.team2Player1Name}
              </p>
```

to:

```tsx
              <p className="text-sm font-semibold text-zinc-800">
                {formatGameSide(game, 'team1')} <span className="font-normal text-zinc-400">vs</span> {formatGameSide(game, 'team2')}
              </p>
```

- [ ] **Step 7: Use `formatGameSide` in the pending queue list**

Change:

```tsx
                  <p className="text-sm font-medium text-zinc-700">
                    {game.team1Player1Name} <span className="text-zinc-400">vs</span> {game.team2Player1Name}
                  </p>
```

to:

```tsx
                  <p className="text-sm font-medium text-zinc-700">
                    {formatGameSide(game, 'team1')} <span className="text-zinc-400">vs</span> {formatGameSide(game, 'team2')}
                  </p>
```

- [ ] **Step 8: Update `CourtCard` to show both players per side, levels for both, and a category badge**

Change:

```tsx
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold tabular-nums" style={{ color: isActive ? courtPhase.running.text : '#a1a1aa' }}>
          Court {courtNumber}
        </span>
        {isActive && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Playing</span>
        )}
      </div>
```

to:

```tsx
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tabular-nums" style={{ color: isActive ? courtPhase.running.text : '#a1a1aa' }}>
            Court {courtNumber}
          </span>
          {game?.category && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">{game.category}{game.slotNumber}</span>
          )}
        </div>
        {isActive && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Playing</span>
        )}
      </div>
```

Then change:

```tsx
          <div className="flex-1 flex flex-col justify-center gap-2">
            <div className="text-center">
              <p className="text-lg font-bold text-zinc-900 truncate">{game.team1Player1Name}</p>
              <p className="text-xs text-zinc-400 mt-0.5">Lv{game.team1Player1Level}</p>
            </div>
            <div className="text-center text-sm font-bold text-zinc-400">vs</div>
            <div className="text-center">
              <p className="text-lg font-bold text-zinc-900 truncate">{game.team2Player1Name}</p>
              <p className="text-xs text-zinc-400 mt-0.5">Lv{game.team2Player1Level}</p>
            </div>
          </div>
```

to:

```tsx
          <div className="flex-1 flex flex-col justify-center gap-2">
            <div className="text-center">
              <p className="text-lg font-bold text-zinc-900 truncate">{formatGameSide(game, 'team1')}</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {game.team1Player2Level != null ? `Lv${game.team1Player1Level}/${game.team1Player2Level}` : `Lv${game.team1Player1Level}`}
              </p>
            </div>
            <div className="text-center text-sm font-bold text-zinc-400">vs</div>
            <div className="text-center">
              <p className="text-lg font-bold text-zinc-900 truncate">{formatGameSide(game, 'team2')}</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {game.team2Player2Level != null ? `Lv${game.team2Player1Level}/${game.team2Player2Level}` : `Lv${game.team2Player1Level}`}
              </p>
            </div>
          </div>
```

- [ ] **Step 9: Typecheck the renderer**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit the renderer half**

```bash
git add src/renderer/pages/TournamentLivePanel.tsx
git commit -m "feat(live-panel): render doubles partners and category badges on the live court screen"
```

---

### Task 10: e2e regression test for the full flow

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

### Task 11: Full regression pass

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

- **Spec coverage:** composition input (Task 6) ✓, gender+level-aware auto-assignment (Task 2) ✓, per-tie skip + warnings (Task 2 + 3) ✓, category/slot labeling (Task 7) ✓, fine-tune reassignment with gender validation (Task 2 + 4 + 8) ✓, schema changes (Task 1) ✓, unit + e2e testing (Task 2 + 10) ✓.
- **Advisor pass incorporated:** an independent review of the first draft of this plan found that `TournamentLivePanel.tsx` (the live court-assignment/scoring screen) would silently hide doubles partners since its `Game` interface and query never carried a second player — this was originally left as a "follow-up," but is now Task 9, fully implemented in this plan rather than deferred. The review also flagged that `validateTeamReassignment`'s rejection branches (gender mismatch, non-team-member, singles/doubles shape mismatches) had no unit test — Task 2 now defines and tests it as a pure function (mirroring the existing `validateTournamentRegistration` pattern) instead of an untested closure inside the IPC handler.
- **Known accepted edge case (documented, not fixed):** under forced reuse (a doubles pool smaller than needed for the requested count), `pairAdjacentByLevel`'s modulo wraparound can occasionally pair the lowest- and highest-level remaining players instead of two adjacent levels. This only happens when the roster is too small to give everyone a fresh partner every rubber — the spec already accepts reuse in that situation — and the "fine-tune" reassignment feature (Task 4 + 8) is the escape hatch if an organizer notices a bad pairing.
- **No placeholders:** every step has literal code.
- **Type/name consistency:** `TeamMatchComposition`, `TeamMatchGameSpec`, `TeamMatchCategory`, `BuildTeamMatchGamesResult`, `TeamReassignmentInput`, `TeamRosterPlayer` are defined once in Task 2 and reused with identical names/shapes in Tasks 3, 4, 5, 6, 7, 8, 9. `buildTeamMatchGames`'s return shape (`{ games, skipped }`) matches what Task 3's handler destructures. The renderer's `composition` state field names (`ms`/`ws`/`md`/`xd`/`wd`) match `TeamMatchComposition`'s fields exactly, so `parseInt(composition.ms)` etc. line up with what `tournamentTeamMatchesGenerate` expects. Task 4's import edit is written as a diff against Task 3's exact resulting import block, so the two apply cleanly in sequence.
