# Tournament Group Stage + Knockout ("Mixed" Format) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AutoRally's `mixed` tournament format actually run a group-stage-then-knockout tournament (World Cup style) instead of silently behaving like `round_robin`.

**Architecture:** Add a `tournament_groups` table and a `groupId` column on `tournament_registrations`/`tournament_matches`. Reuse the existing round-robin generator, per-set scoring, and standings calculator unmodified inside each group. Add one new pure function to build the first knockout round from group qualifiers (offset pairing to avoid same-group rematches), then hand off to the existing knockout-advancement code unmodified.

**Tech Stack:** TypeScript, Electron (main process: `sql.js` via `src/main/database.ts`), React renderer, Vitest for unit tests.

**Spec:** `docs/superpowers/specs/2026-08-27-tournament-group-stage-design.md`

## Global Constraints

- `groupCount × advancePerGroup` must be a power of 2 (2, 4, 8, 16...) — enforced at tournament creation, both client-side (`Tournaments.tsx`) and server-side (`ipc.ts`).
- All new DB migrations follow the existing `try { db.run('ALTER TABLE ...') } catch (_) {}` style in `src/main/database.ts` — never rewrite an existing migration line.
- New pure logic (grouping, pairing, validation) lives in `src/main/tournament.ts` alongside the existing knockout/round-robin functions, in the same no-database-access style, and is tested directly via Vitest — no Electron needed for these tests.
- Team Tournament mode (`tournament_teams`/`tournament_team_matches`) is untouched by this plan.
- Reuse existing helpers instead of duplicating: `avgLevel`, `pendingMatch`, `byeMatch`, `knockoutRoundName`, `teamKey`, `computeTournamentStandings`, `generateRoundRobinMatches`, `buildNextKnockoutMatches`, `computeMatchOutcome` (per-set scoring).

---

## Task 1: Database migration — groups table and new columns

**Files:**
- Modify: `src/main/database.ts:242` (insert new `CREATE TABLE` block after the `tournament_team_matches` block, before the `INSERT OR IGNORE INTO settings` lines)
- Modify: `src/main/database.ts:269` (append 4 new `ALTER TABLE` migration lines, after the existing `set3Team2Score` line and before `migrateGameTypeConstraint(db)`)
- Test: `src/__tests__/database.test.ts`

**Interfaces:**
- Produces: `tournament_groups` table (`id`, `tournamentId`, `name`); `tournaments.groupCount` (INTEGER, nullable); `tournaments.advancePerGroup` (INTEGER, nullable); `tournament_registrations.groupId` (TEXT, nullable, FK); `tournament_matches.groupId` (TEXT, nullable, FK).

- [ ] **Step 1: Add the `tournament_groups` CREATE TABLE block**

In `src/main/database.ts`, right after the closing `` ` `); `` of the `tournament_team_matches` block (currently ending at line 242) and before the `db.run("INSERT OR IGNORE INTO settings...")` lines, insert:

```ts
  db.run(`
    CREATE TABLE IF NOT EXISTS tournament_groups (
      id TEXT PRIMARY KEY,
      tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      name TEXT NOT NULL
    );
  `);
```

- [ ] **Step 2: Add the four ALTER TABLE migrations**

In the same file, right after the line `try { db.run('ALTER TABLE tournament_matches ADD COLUMN set3Team2Score INTEGER DEFAULT NULL'); dirty = true; } catch (_) { /* already exists */ }` and before `if (migrateGameTypeConstraint(db)) dirty = true;`, insert:

```ts
  try { db.run('ALTER TABLE tournaments ADD COLUMN groupCount INTEGER'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournaments ADD COLUMN advancePerGroup INTEGER'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_registrations ADD COLUMN groupId TEXT REFERENCES tournament_groups(id)'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_matches ADD COLUMN groupId TEXT REFERENCES tournament_groups(id)'); dirty = true; } catch (_) { /* already exists */ }
```

- [ ] **Step 3: Verify migrations run cleanly on a fresh DB and a re-run**

Run: `npx vitest run src/__tests__/database.test.ts`
Expected: PASS (existing tests don't reference these new columns, so this just proves `initDb` doesn't throw). Also manually confirm by running `node -e "..."` is unnecessary — the existing test suite already calls `initDb` fresh in `beforeEach`, which exercises both the `CREATE TABLE` and every `ALTER TABLE` line (including on a schema that already has the columns, proving the `try/catch` skip path works).

- [ ] **Step 4: Commit**

```bash
git add src/main/database.ts
git commit -m "feat: add tournament_groups table and groupId columns for group-stage format"
```

---

## Task 2: Group assignment algorithm (snake seeding)

**Files:**
- Modify: `src/main/tournament.ts` (add after `generateRoundRobinMatches`, i.e. after line 198)
- Test: `src/__tests__/tournament.test.ts`

**Interfaces:**
- Consumes: `TournamentRegistration` (existing type, `tournament.ts:1`), the module-private `avgLevel` function (`tournament.ts:49`).
- Produces: `TournamentGroup { id: string; name: string }`, `assignRegistrationsToGroups(registrations: TournamentRegistration[], groups: TournamentGroup[]): Map<string, TournamentRegistration[]>`.

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/tournament.test.ts`, inside a new `describe('assignRegistrationsToGroups', ...)` block (place it after the existing `describe('tournament scheduling', ...)` block closes, i.e. after line 190's `});`):

```ts
describe('assignRegistrationsToGroups', () => {
  function group(name: string): TournamentGroup {
    return { id: `g-${name}`, name };
  }

  it('snake-drafts registrations across groups by level, weakest to strongest reversing each pass', () => {
    // levels 1..8, group() helper defaults to level 3 so build explicit regs
    const regs = [1, 2, 3, 4, 5, 6, 7, 8].map(lv => ({
      id: `r${lv}`, player1Id: `p${lv}`, player1Level: lv, player2Id: null, player2Level: null,
    }));
    const groups = [group('A'), group('B'), group('C'), group('D')];
    const byGroup = assignRegistrationsToGroups(regs, groups);

    expect(byGroup.get('g-A')!.map(r => r.id)).toEqual(['r1', 'r8']);
    expect(byGroup.get('g-B')!.map(r => r.id)).toEqual(['r2', 'r7']);
    expect(byGroup.get('g-C')!.map(r => r.id)).toEqual(['r3', 'r6']);
    expect(byGroup.get('g-D')!.map(r => r.id)).toEqual(['r4', 'r5']);
  });

  it('distributes leftover registrations as evenly as possible when count is not divisible by group count', () => {
    const regs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(lv => ({
      id: `r${lv}`, player1Id: `p${lv}`, player1Level: lv, player2Id: null, player2Level: null,
    }));
    const groups = [group('A'), group('B'), group('C'), group('D')];
    const byGroup = assignRegistrationsToGroups(regs, groups);

    const sizes = groups.map(g => byGroup.get(g.id)!.length);
    expect(sizes.sort()).toEqual([2, 2, 3, 3]);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(10);
  });
});
```

Also add `TournamentGroup` and `assignRegistrationsToGroups` to the existing import block at the top of `src/__tests__/tournament.test.ts` (the `import { ... } from '../main/tournament';` block).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/tournament.test.ts -t "assignRegistrationsToGroups"`
Expected: FAIL — `assignRegistrationsToGroups` is not exported / does not exist.

- [ ] **Step 3: Implement**

In `src/main/tournament.ts`, add after `generateRoundRobinMatches` (after the closing `}` currently at line 198):

```ts
export interface TournamentGroup {
  id: string;
  name: string;
}

export function assignRegistrationsToGroups(
  registrations: TournamentRegistration[],
  groups: TournamentGroup[],
): Map<string, TournamentRegistration[]> {
  const seeded = [...registrations].sort((a, b) => avgLevel(a) - avgLevel(b));
  const byGroup = new Map<string, TournamentRegistration[]>(groups.map(g => [g.id, []]));
  let dir = 1;
  let idx = 0;
  for (const reg of seeded) {
    byGroup.get(groups[idx]!.id)!.push(reg);
    if (idx === groups.length - 1 && dir === 1) dir = -1;
    else if (idx === 0 && dir === -1) dir = 1;
    else idx += dir;
  }
  return byGroup;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/tournament.test.ts -t "assignRegistrationsToGroups"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/tournament.ts src/__tests__/tournament.test.ts
git commit -m "feat: add snake-draft group assignment for tournament group stage"
```

---

## Task 3: Group-to-knockout pairing

**Files:**
- Modify: `src/main/tournament.ts` (add after `assignRegistrationsToGroups`, from Task 2)
- Test: `src/__tests__/tournament.test.ts`

**Interfaces:**
- Consumes: `TournamentGroup` (Task 2), `TournamentStanding` (`tournament.ts:32`), the module-private `knockoutRoundName` (`tournament.ts:57`) and `pendingMatch` (`tournament.ts:77`).
- Produces: `GroupStanding extends TournamentStanding { groupId: string }`, `buildFirstKnockoutRound(tournamentId: string, groupsInOrder: TournamentGroup[], qualifiersByGroup: Map<string, GroupStanding[]>, advancePerGroup: 1 | 2, makeId: IdFactory): TournamentMatchRecord[]`.

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/tournament.test.ts`, in a new `describe('buildFirstKnockoutRound', ...)` block after the `assignRegistrationsToGroups` block from Task 2:

```ts
describe('buildFirstKnockoutRound', () => {
  function standing(id: string, groupId: string): GroupStanding {
    return { groupId, player1Id: id, player2Id: null, played: 2, wins: 2, losses: 0, pf: 42, pa: 20 };
  }

  it('pairs winners only, seeded-halves style, when one advances per group', () => {
    const groups = ['A', 'B', 'C', 'D'].map(name => ({ id: `g-${name}`, name }));
    const qualifiers = new Map(groups.map(g => [g.id, [standing(`W${g.name}`, g.id)]]));
    const matches = buildFirstKnockoutRound('t1', groups, qualifiers, 1, ids());

    expect(matches).toHaveLength(2);
    expect(matches.every(m => m.status === 'pending')).toBe(true);
    const pairs = matches.map(m => [m.team1Player1Id, m.team2Player1Id].sort());
    expect(pairs).toContainEqual(['WA', 'WD'].sort());
    expect(pairs).toContainEqual(['WB', 'WC'].sort());
  });

  it('offsets runners-up by one group so no group meets its own runner-up in round 1', () => {
    const groups = ['A', 'B', 'C', 'D'].map(name => ({ id: `g-${name}`, name }));
    const qualifiers = new Map(groups.map(g => [g.id, [standing(`W${g.name}`, g.id), standing(`R${g.name}`, g.id)]]));
    const matches = buildFirstKnockoutRound('t1', groups, qualifiers, 2, ids());

    expect(matches).toHaveLength(4);
    for (const m of matches) {
      const winnerGroup = m.team1Player1Id.slice(1); // 'WA' -> 'A'
      const runnerUpGroup = m.team2Player1Id.slice(1); // 'RB' -> 'B'
      expect(winnerGroup).not.toBe(runnerUpGroup);
    }
    const pairs = matches.map(m => [m.team1Player1Id, m.team2Player1Id]);
    expect(pairs).toEqual([['WA', 'RB'], ['WB', 'RC'], ['WC', 'RD'], ['WD', 'RA']]);
  });
});
```

Add `GroupStanding` and `buildFirstKnockoutRound` to the test file's import block.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/tournament.test.ts -t "buildFirstKnockoutRound"`
Expected: FAIL — not exported / does not exist.

- [ ] **Step 3: Implement**

In `src/main/tournament.ts`, add after `assignRegistrationsToGroups`:

```ts
export interface GroupStanding extends TournamentStanding {
  groupId: string;
}

export function buildFirstKnockoutRound(
  tournamentId: string,
  groupsInOrder: TournamentGroup[],
  qualifiersByGroup: Map<string, GroupStanding[]>,
  advancePerGroup: 1 | 2,
  makeId: IdFactory,
): TournamentMatchRecord[] {
  const winners = groupsInOrder.map(g => qualifiersByGroup.get(g.id)![0]!);

  if (advancePerGroup === 1) {
    const round = knockoutRoundName(winners.length);
    const matches: TournamentMatchRecord[] = [];
    for (let i = 0; i < winners.length / 2; i++) {
      const a = winners[i]!;
      const b = winners[winners.length - 1 - i]!;
      matches.push(pendingMatch(makeId(), tournamentId, round, i + 1,
        { player1Id: a.player1Id, player2Id: a.player2Id },
        { player1Id: b.player1Id, player2Id: b.player2Id }));
    }
    return matches;
  }

  const runnersUp = groupsInOrder.map(g => qualifiersByGroup.get(g.id)![1]!);
  const shifted = [...runnersUp.slice(1), runnersUp[0]!];
  const round = knockoutRoundName(winners.length * 2);
  return winners.map((w, i) => pendingMatch(makeId(), tournamentId, round, i + 1,
    { player1Id: w.player1Id, player2Id: w.player2Id },
    { player1Id: shifted[i]!.player1Id, player2Id: shifted[i]!.player2Id }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/tournament.test.ts -t "buildFirstKnockoutRound"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/tournament.ts src/__tests__/tournament.test.ts
git commit -m "feat: add group-to-knockout offset pairing"
```

---

## Task 4: Group reassignment validation

**Files:**
- Modify: `src/main/tournament.ts` (add after `buildFirstKnockoutRound`)
- Test: `src/__tests__/tournament.test.ts`

**Interfaces:**
- Consumes: `TournamentMatchRecord['status']`.
- Produces: `validateGroupReassignment(currentGroupMatches: TournamentMatchRecord[], targetGroupMatches: TournamentMatchRecord[]): void` — throws on violation, returns nothing on success.

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/tournament.test.ts`, a new `describe('validateGroupReassignment', ...)` block after the `buildFirstKnockoutRound` block:

```ts
describe('validateGroupReassignment', () => {
  function match(status: TournamentMatchRecord['status']): TournamentMatchRecord {
    return {
      id: 'm1', tournamentId: 't1', round: 'R1', matchNumber: 1, courtNumber: null, status,
      team1Player1Id: 'a', team1Player2Id: null, team2Player1Id: 'b', team2Player2Id: null,
      team1Score: null, team2Score: null, winner: null, completedAt: null,
    };
  }

  it('allows reassignment when both groups have only pending matches', () => {
    expect(() => validateGroupReassignment([match('pending')], [match('pending')])).not.toThrow();
  });

  it('rejects when the source group has already started', () => {
    expect(() => validateGroupReassignment([match('completed')], [match('pending')])).toThrow(/already started/i);
  });

  it('rejects when the target group has already started', () => {
    expect(() => validateGroupReassignment([match('pending')], [match('in_progress')])).toThrow(/already started/i);
  });
});
```

Add `validateGroupReassignment` to the test file's import block.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/tournament.test.ts -t "validateGroupReassignment"`
Expected: FAIL — not exported / does not exist.

- [ ] **Step 3: Implement**

In `src/main/tournament.ts`, add after `buildFirstKnockoutRound`:

```ts
export function validateGroupReassignment(
  currentGroupMatches: TournamentMatchRecord[],
  targetGroupMatches: TournamentMatchRecord[],
): void {
  if (currentGroupMatches.some(m => m.status !== 'pending')) {
    throw new Error('This registration\'s group has already started — cannot move them out');
  }
  if (targetGroupMatches.some(m => m.status !== 'pending')) {
    throw new Error('The target group has already started — cannot move them in');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/tournament.test.ts -t "validateGroupReassignment"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/tournament.ts src/__tests__/tournament.test.ts
git commit -m "feat: add group reassignment validation"
```

---

## Task 5: Tournament creation accepts groupCount/advancePerGroup

**Files:**
- Modify: `src/main/ipc.ts:746` (`tournaments:create` handler)
- Modify: `src/main/preload.ts` (`tournamentsCreate` signature)
- Test: `src/__tests__/tournament.test.ts` (pure validation function), manual smoke via existing e2e pattern (not run here, see Task 10)

**Interfaces:**
- Consumes: nothing new.
- Produces: `validateGroupTournamentConfig(format: string, groupCount: number | undefined, advancePerGroup: number | undefined): void` (new pure function in `tournament.ts`), extended `tournaments:create` IPC payload `{ ...existing, groupCount?: number; advancePerGroup?: 1 | 2 }`.

- [ ] **Step 1: Write the failing test for the validation function**

Add to `src/__tests__/tournament.test.ts`, a new `describe('validateGroupTournamentConfig', ...)` block:

```ts
describe('validateGroupTournamentConfig', () => {
  it('allows non-mixed formats regardless of groupCount/advancePerGroup', () => {
    expect(() => validateGroupTournamentConfig('knockout', undefined, undefined)).not.toThrow();
  });

  it('requires groupCount and advancePerGroup for mixed format', () => {
    expect(() => validateGroupTournamentConfig('mixed', undefined, undefined)).toThrow(/group count/i);
    expect(() => validateGroupTournamentConfig('mixed', 4, undefined)).toThrow(/advance/i);
  });

  it('rejects a qualifier total that is not a power of two', () => {
    expect(() => validateGroupTournamentConfig('mixed', 3, 2)).toThrow(/power of two|power of 2/i);
    expect(() => validateGroupTournamentConfig('mixed', 4, 2)).not.toThrow();
    expect(() => validateGroupTournamentConfig('mixed', 2, 1)).not.toThrow();
  });
});
```

Add `validateGroupTournamentConfig` to the test file's import block.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/tournament.test.ts -t "validateGroupTournamentConfig"`
Expected: FAIL — not exported / does not exist.

- [ ] **Step 3: Implement the validation function**

In `src/main/tournament.ts`, add after `validateGroupReassignment` (Task 4):

```ts
function isPowerOfTwo(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0;
}

export function validateGroupTournamentConfig(
  format: string,
  groupCount: number | undefined,
  advancePerGroup: number | undefined,
): void {
  if (format !== 'mixed') return;
  if (!groupCount || groupCount < 2) throw new Error('Group count must be at least 2');
  if (advancePerGroup !== 1 && advancePerGroup !== 2) throw new Error('Advance-per-group must be 1 or 2');
  if (!isPowerOfTwo(groupCount * advancePerGroup)) {
    throw new Error('Group count × advance-per-group must be a power of two (2, 4, 8, 16...)');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/tournament.test.ts -t "validateGroupTournamentConfig"`
Expected: PASS

- [ ] **Step 5: Wire validation into `tournaments:create` and extend the INSERT**

In `src/main/ipc.ts`, replace the `tournaments:create` handler (currently at line 746):

```ts
  ipcMain.handle('tournaments:create', (_e, data: { name: string; description?: string; date: string; format: string; courtCount?: number; groupCount?: number; advancePerGroup?: 1 | 2 }) => {
    validateGroupTournamentConfig(data.format, data.groupCount, data.advancePerGroup);
    const id = uuid();
    const now = new Date().toISOString();
    run('INSERT INTO tournaments (id, name, description, date, format, status, courtCount, groupCount, advancePerGroup, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, data.name, data.description ?? '', data.date, data.format, 'upcoming', data.courtCount ?? 4, data.groupCount ?? null, data.advancePerGroup ?? null, now]);
    return { id, ...data, description: data.description ?? '', status: 'upcoming' as const, courtCount: data.courtCount ?? 4, createdAt: now };
  });
```

Add `validateGroupTournamentConfig` to the `import { ... } from './tournament';` block at the top of `ipc.ts` (alongside the existing `validateMatchReassignment`, etc.).

- [ ] **Step 6: Update preload.ts signature**

In `src/main/preload.ts`, find `tournamentsCreate:` and change:

```ts
  tournamentsCreate: (data: { name: string; description?: string; date: string; format: string; courtCount?: number; groupCount?: number; advancePerGroup?: 1 | 2 }) => ipcRenderer.invoke('tournaments:create', data),
```

- [ ] **Step 7: Run full main-process typecheck**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/main/tournament.ts src/main/ipc.ts src/main/preload.ts src/__tests__/tournament.test.ts
git commit -m "feat: validate and persist groupCount/advancePerGroup on tournament creation"
```

---

## Task 6: Generate group stage from `tournaments:generateBracket`

**Files:**
- Modify: `src/main/ipc.ts` (`insertTournamentMatch` at line 806, `tournaments:generateBracket` at line 835)
- Test: manual repro via the running app (see Task 10) — this task is IPC glue over already-tested pure functions (Tasks 2–3), so no new unit test is added here; the pure logic it calls is already covered.

**Interfaces:**
- Consumes: `assignRegistrationsToGroups` (Task 2), `TournamentGroup` (Task 2), `generateRoundRobinMatches` (existing).
- Produces: for `format === 'mixed'`, `tournament_groups` rows, `tournament_registrations.groupId` populated, `tournament_matches` rows tagged with `groupId`.

- [ ] **Step 1: Extend `insertTournamentMatch` to accept and persist `groupId`**

In `src/main/ipc.ts`, modify the `insertTournamentMatch` function (currently at line 806):

```ts
  function insertTournamentMatch(match: TournamentMatchRecord & { teamMatchId?: string | null; category?: string | null; slotNumber?: number | null; groupId?: string | null }) {
    run(
      `INSERT INTO tournament_matches (
        id, tournamentId, round, matchNumber, courtNumber, status,
        team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id,
        team1Score, team2Score, winner, completedAt, teamMatchId, category, slotNumber, groupId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        match.groupId ?? null,
      ],
    );
  }
```

(This is additive — every other caller of `insertTournamentMatch` simply omits `groupId`, which defaults to `null`, exactly like `teamMatchId`/`category`/`slotNumber` already do.)

- [ ] **Step 2: Add the `mixed` branch to `tournaments:generateBracket`**

In `src/main/ipc.ts`, replace the `tournaments:generateBracket` handler (currently at line 835):

```ts
  ipcMain.handle('tournaments:generateBracket', (_e, tournamentId: string) => {
    return transaction(() => {
      run('DELETE FROM tournament_matches WHERE tournamentId = ?', [tournamentId]);
      run('DELETE FROM tournament_standings WHERE tournamentId = ?', [tournamentId]);
      // Must null out registrations' groupId BEFORE deleting the groups they
      // reference — this DB runs with PRAGMA foreign_keys = ON, so deleting a
      // still-referenced tournament_groups row would throw a constraint error.
      run('UPDATE tournament_registrations SET groupId = NULL WHERE tournamentId = ?', [tournamentId]);
      run('DELETE FROM tournament_groups WHERE tournamentId = ?', [tournamentId]);

      const t = queryOne<{ format: string; courtCount: number; groupCount: number | null; advancePerGroup: number | null }>(
        'SELECT format, courtCount, groupCount, advancePerGroup FROM tournaments WHERE id = ?', [tournamentId]
      );
      if (!t) return [];

      const regs = queryAll<TournamentRegistration>(
        `SELECT tr.*, p1.name as player1Name, p1.gender as player1Gender, p1.level as player1Level,
           p2.name as player2Name, p2.gender as player2Gender, p2.level as player2Level
         FROM tournament_registrations tr
         JOIN players p1 ON tr.player1Id = p1.id
         LEFT JOIN players p2 ON tr.player2Id = p2.id
         WHERE tr.tournamentId = ?`, [tournamentId]
      );

      if (regs.length < 2) return [];

      if (t.format === 'mixed') {
        const groupCount = t.groupCount ?? 0;
        if (groupCount < 2) return [];
        const groups: TournamentGroup[] = Array.from({ length: groupCount }, (_, i) => ({
          id: uuid(),
          name: String.fromCharCode('A'.charCodeAt(0) + i),
        }));
        for (const g of groups) {
          run('INSERT INTO tournament_groups (id, tournamentId, name) VALUES (?, ?, ?)', [g.id, tournamentId, g.name]);
        }
        const byGroup = assignRegistrationsToGroups(regs, groups);
        const allMatches: TournamentMatchRecord[] = [];
        for (const g of groups) {
          const groupRegs = byGroup.get(g.id) ?? [];
          run('UPDATE tournament_registrations SET groupId = ? WHERE id IN (' + groupRegs.map(() => '?').join(',') + ')',
            [g.id, ...groupRegs.map(r => r.id)]);
          const groupMatches = generateRoundRobinMatches(tournamentId, groupRegs, t.courtCount, uuid);
          for (const match of groupMatches) {
            insertTournamentMatch({ ...match, groupId: g.id });
            allMatches.push(match);
          }
        }
        return allMatches;
      }

      const matches = t.format === 'knockout'
        ? generateKnockoutMatches(tournamentId, regs, uuid)
        : generateRoundRobinMatches(tournamentId, regs, t.courtCount, uuid);
      for (const match of matches) insertTournamentMatch(match);
      return matches;
    });
  });
```

Note: the `run('UPDATE tournament_registrations SET groupId = ? WHERE id IN (...)', ...)` call guards against `groupRegs.length === 0` — if a group ends up empty (shouldn't happen given `regs.length >= 2` and `groupCount >= 2`, but guard anyway): wrap it in `if (groupRegs.length > 0) { ... }`.

Add `TournamentGroup` and `assignRegistrationsToGroups` to the `import { ... } from './tournament';` block in `ipc.ts`.

- [ ] **Step 3: Guard the empty-group edge case**

Re-check the code from Step 2 — wrap the `UPDATE tournament_registrations` call:

```ts
        for (const g of groups) {
          const groupRegs = byGroup.get(g.id) ?? [];
          if (groupRegs.length > 0) {
            run('UPDATE tournament_registrations SET groupId = ? WHERE id IN (' + groupRegs.map(() => '?').join(',') + ')',
              [g.id, ...groupRegs.map(r => r.id)]);
          }
          const groupMatches = generateRoundRobinMatches(tournamentId, groupRegs, t.courtCount, uuid);
          for (const match of groupMatches) {
            insertTournamentMatch({ ...match, groupId: g.id });
            allMatches.push(match);
          }
        }
```

- [ ] **Step 4: Run main-process typecheck**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat: generate group-stage schedule for mixed-format tournaments"
```

---

## Task 7: Group standings and knockout generation IPC handlers

**Files:**
- Modify: `src/main/ipc.ts` (add after `tournaments:standings`, currently ending around line 944)
- Modify: `src/main/preload.ts`
- Test: manual repro via the running app (Task 10) — wraps already-tested pure functions.

**Interfaces:**
- Consumes: `computeTournamentStandings` (existing), `buildFirstKnockoutRound` (Task 3), `GroupStanding` (Task 3).
- Produces: `tournaments:groupStandings(tournamentId)` → `{ groupId: string; groupName: string; standings: (GroupStanding & { player1Name; player2Name })[] }[]`; `tournaments:generateKnockoutFromGroups(tournamentId)` → `TournamentMatchRecord[]`.

- [ ] **Step 1: Add `tournaments:groupStandings`**

In `src/main/ipc.ts`, add right after the `tournaments:standings` handler (after its closing `});`, currently around line 944):

```ts
  ipcMain.handle('tournaments:groupStandings', (_e, tournamentId: string) => {
    const groups = queryAll<{ id: string; name: string }>(
      'SELECT id, name FROM tournament_groups WHERE tournamentId = ? ORDER BY name', [tournamentId]
    );
    return groups.map(g => {
      const matches = queryAll<TournamentMatchRecord>(
        "SELECT * FROM tournament_matches WHERE tournamentId = ? AND groupId = ? AND status = 'completed'",
        [tournamentId, g.id]
      );
      const standings = computeTournamentStandings(matches).map(s => {
        const p1 = queryOne<{ name: string }>('SELECT name FROM players WHERE id = ?', [s.player1Id]);
        const p2 = s.player2Id ? queryOne<{ name: string }>('SELECT name FROM players WHERE id = ?', [s.player2Id]) : null;
        return { ...s, groupId: g.id, player1Name: p1?.name ?? '?', player2Name: p2?.name ?? null, diff: s.pf - s.pa };
      });
      return { groupId: g.id, groupName: g.name, standings };
    });
  });
```

- [ ] **Step 2: Add `tournaments:generateKnockoutFromGroups`**

Immediately after, add:

```ts
  ipcMain.handle('tournaments:generateKnockoutFromGroups', (_e, tournamentId: string) => {
    return transaction(() => {
      const t = queryOne<{ format: string; advancePerGroup: 1 | 2 | null }>(
        'SELECT format, advancePerGroup FROM tournaments WHERE id = ?', [tournamentId]
      );
      if (!t || t.format !== 'mixed' || !t.advancePerGroup) throw new Error('Not a mixed-format tournament');

      const groups = queryAll<{ id: string; name: string }>(
        'SELECT id, name FROM tournament_groups WHERE tournamentId = ? ORDER BY name', [tournamentId]
      );
      if (groups.length === 0) throw new Error('No groups found — generate the group schedule first');

      for (const g of groups) {
        const incomplete = queryOne<{ id: string }>(
          "SELECT id FROM tournament_matches WHERE tournamentId = ? AND groupId = ? AND status != 'completed' LIMIT 1",
          [tournamentId, g.id]
        );
        if (incomplete) throw new Error(`Group ${g.name} has unfinished matches`);
      }

      const existingKnockout = queryOne<{ id: string }>(
        'SELECT id FROM tournament_matches WHERE tournamentId = ? AND groupId IS NULL LIMIT 1', [tournamentId]
      );
      if (existingKnockout) throw new Error('Knockout stage has already been generated');

      const qualifiersByGroup = new Map<string, GroupStanding[]>();
      for (const g of groups) {
        const matches = queryAll<TournamentMatchRecord>(
          "SELECT * FROM tournament_matches WHERE tournamentId = ? AND groupId = ? AND status = 'completed'",
          [tournamentId, g.id]
        );
        const standings = computeTournamentStandings(matches).map(s => ({ ...s, groupId: g.id }));
        if (standings.length < t.advancePerGroup!) {
          throw new Error(`Group ${g.name} does not have enough completed standings to advance ${t.advancePerGroup} team(s)`);
        }
        qualifiersByGroup.set(g.id, standings);
      }

      const matches = buildFirstKnockoutRound(tournamentId, groups, qualifiersByGroup, t.advancePerGroup as 1 | 2, uuid);
      for (const match of matches) insertTournamentMatch(match);
      return matches;
    });
  });
```

Add `GroupStanding` and `buildFirstKnockoutRound` to the `import { ... } from './tournament';` block.

- [ ] **Step 3: Expose both in preload.ts**

In `src/main/preload.ts`, add near the other `tournaments*` entries:

```ts
  tournamentsGroupStandings: (tournamentId: string) => ipcRenderer.invoke('tournaments:groupStandings', tournamentId),
  tournamentsGenerateKnockoutFromGroups: (tournamentId: string) => ipcRenderer.invoke('tournaments:generateKnockoutFromGroups', tournamentId),
```

- [ ] **Step 4: Run main-process typecheck**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/main/preload.ts
git commit -m "feat: add group standings and generate-knockout-from-groups IPC handlers"
```

---

## Task 8: Manual group reassignment IPC handler + fix Edit Matchup's round scoping

**Files:**
- Modify: `src/main/ipc.ts` (add `tournaments:reassignGroup`; fix `tournaments:reassignMatch`'s `roundMatches` query, currently at line 897)
- Modify: `src/main/preload.ts`
- Test: manual repro via the running app (Task 10)

**Interfaces:**
- Consumes: `validateGroupReassignment` (Task 4).
- Produces: `tournaments:reassignGroup(registrationId, newGroupId)`.

**Why the `reassignMatch` fix belongs here:** group-stage matches restart round numbering per group (`R1`, `R2`, ... inside each group independently), so once groups exist, `round = 'R1'` is no longer unique tournament-wide — two different groups both have an `R1`. The existing `tournaments:reassignMatch` handler scopes "matches in this round" by `round` alone, so without this fix it would treat another group's `R1` matches as occupying slots in this group's `R1`, corrupting the Edit Matchup feature for any mixed-format tournament. This is a direct, necessary consequence of introducing `groupId` — not unrelated scope creep, and it does not touch the separate dropdown-options bug already being fixed elsewhere.

- [ ] **Step 1: Fix the round-scoping query in `tournaments:reassignMatch`**

In `src/main/ipc.ts`, inside the `tournaments:reassignMatch` handler (currently at line 880), change the `roundMatches` query (currently at line 897):

```ts
    const roundMatches = queryAll<TournamentMatchRecord>(
      'SELECT * FROM tournament_matches WHERE tournamentId = ? AND round = ? AND groupId IS ?',
      [match.tournamentId, match.round, match.groupId ?? null]
    );
```

(`match` here is already fetched via `SELECT * FROM tournament_matches WHERE id = ?`, so `match.groupId` is available once Task 1's column exists — no other change needed to that earlier query.)

- [ ] **Step 2: Add `tournaments:reassignGroup`**

Add a new handler after `tournaments:reassignMatch` (after its closing `});`, currently around line 908):

```ts
  ipcMain.handle('tournaments:reassignGroup', (_e, registrationId: string, newGroupId: string) => {
    const reg = queryOne<{ id: string; tournamentId: string; groupId: string | null }>(
      'SELECT id, tournamentId, groupId FROM tournament_registrations WHERE id = ?', [registrationId]
    );
    if (!reg) throw new Error('Registration not found');
    if (!reg.groupId) throw new Error('This registration is not in a group');

    const currentGroupMatches = queryAll<TournamentMatchRecord>(
      'SELECT * FROM tournament_matches WHERE tournamentId = ? AND groupId = ?', [reg.tournamentId, reg.groupId]
    );
    const targetGroupMatches = queryAll<TournamentMatchRecord>(
      'SELECT * FROM tournament_matches WHERE tournamentId = ? AND groupId = ?', [reg.tournamentId, newGroupId]
    );
    validateGroupReassignment(currentGroupMatches, targetGroupMatches);

    return transaction(() => {
      const oldGroupId = reg.groupId!;
      run('UPDATE tournament_registrations SET groupId = ? WHERE id = ?', [newGroupId, registrationId]);

      // Both groups' round-robin schedules must be rebuilt with the new membership.
      run('DELETE FROM tournament_matches WHERE tournamentId = ? AND groupId IN (?, ?)', [reg.tournamentId, oldGroupId, newGroupId]);

      const t = queryOne<{ courtCount: number }>('SELECT courtCount FROM tournaments WHERE id = ?', [reg.tournamentId]);
      for (const gid of [oldGroupId, newGroupId]) {
        const groupRegs = queryAll<TournamentRegistration>(
          `SELECT tr.*, p1.level as player1Level, p2.level as player2Level
           FROM tournament_registrations tr
           JOIN players p1 ON tr.player1Id = p1.id
           LEFT JOIN players p2 ON tr.player2Id = p2.id
           WHERE tr.groupId = ?`, [gid]
        );
        const groupMatches = generateRoundRobinMatches(reg.tournamentId, groupRegs, t?.courtCount ?? 4, uuid);
        for (const match of groupMatches) insertTournamentMatch({ ...match, groupId: gid });
      }
    });
  });
```

Add `validateGroupReassignment` to the `import { ... } from './tournament';` block.

- [ ] **Step 3: Expose in preload.ts**

```ts
  tournamentsReassignGroup: (registrationId: string, newGroupId: string) => ipcRenderer.invoke('tournaments:reassignGroup', registrationId, newGroupId),
```

- [ ] **Step 4: Run main-process typecheck**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/main/preload.ts
git commit -m "feat: add manual group reassignment; scope Edit Matchup to the correct group"
```

---

## Task 9: Frontend — creation form, Groups tab, Edit Group modal

**Files:**
- Modify: `src/renderer/pages/Tournaments.tsx` (`CreateModal`)
- Modify: `src/renderer/pages/TournamentDetail.tsx` (`MatchRow` type, tab list, new "Groups" tab content, new `EditGroupModal` component, "Generate Knockout" button)
- Test: manual verification via the running app (Task 10) — this is UI wiring over already-tested backend logic.

**Interfaces:**
- Consumes: `window.api.tournamentsCreate` (extended, Task 5), `window.api.tournamentsGroupStandings`/`tournamentsGenerateKnockoutFromGroups` (Task 7), `window.api.tournamentsReassignGroup` (Task 8).

- [ ] **Step 1: Add groupCount/advancePerGroup inputs to `CreateModal`**

In `src/renderer/pages/Tournaments.tsx`, inside `CreateModal`, add two new state variables next to `courtCount` (currently line 28):

```ts
  const [groupCount, setGroupCount] = useState('4');
  const [advancePerGroup, setAdvancePerGroup] = useState<'1' | '2'>('2');
```

In `handleCreate` (currently line 32), pass the new fields when `format === 'mixed'`:

```ts
  const handleCreate = async () => {
    if (!name.trim() || !date) return;
    setSaving(true);
    setError(null);
    try {
      const created = await window.api.tournamentsCreate({
        name: name.trim(),
        description,
        date,
        format,
        courtCount: Number(courtCount) || 4,
        ...(format === 'mixed' ? { groupCount: Number(groupCount) || 0, advancePerGroup: Number(advancePerGroup) as 1 | 2 } : {}),
      }) as { id: string };
      onCreated(created.id);
    } catch (err: any) {
      setError(err?.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  };
```

In the JSX, right after the Format button group (currently closing at line 90), add:

```tsx
          {format === 'mixed' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Groups</label>
                <input type="number" min="2" value={groupCount} onChange={e => setGroupCount(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Advance per group</label>
                <div className="flex gap-2">
                  {(['1', '2'] as const).map(n => (
                    <button key={n} onClick={() => setAdvancePerGroup(n)}
                      className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-all ${advancePerGroup === n ? 'bg-zinc-800 border-zinc-900 text-white' : 'bg-white border-zinc-200 text-zinc-500'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {format === 'mixed' && !isPowerOfTwoClient(Number(groupCount) * Number(advancePerGroup)) && (
            <p className="text-xs font-medium text-red-600">Groups × advance-per-group must be a power of two (2, 4, 8, 16...).</p>
          )}
```

Add a small helper near the top of the file (after `formatLabel`, currently line 21):

```ts
function isPowerOfTwoClient(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0;
}
```

Update the Create button's `disabled` condition (currently line 95) to also block on this:

```tsx
          <button onClick={handleCreate}
            disabled={saving || !name.trim() || !date || (format === 'mixed' && !isPowerOfTwoClient(Number(groupCount) * Number(advancePerGroup)))}
            className="px-5 py-2 text-sm font-semibold bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 active:scale-[0.97] transition-all disabled:opacity-40">
            {saving ? 'Creating...' : 'Create'}
          </button>
```

- [ ] **Step 2: Extend `MatchRow` and add group state to `TournamentDetail.tsx`**

In `src/renderer/pages/TournamentDetail.tsx`, add `groupId: string | null;` to the `MatchRow` interface (next to `teamMatchId`, currently line 49).

Add a `groupId: string | null;` field to `RegRow` too (currently around line 14) — it's already returned by `tournamentsRegistrations` via `SELECT tr.*`, just needs the TS type.

Change the `tab` union type (currently line 280) to include `'groups'`:

```ts
  const [tab, setTab] = useState<'overview' | 'registration' | 'teams' | 'groups' | 'bracket' | 'standings'>('overview');
```

Add new state (next to `editMatchupMatch`, currently line 291):

```ts
  const [groupStandings, setGroupStandings] = useState<{ groupId: string; groupName: string; standings: any[] }[]>([]);
  const [editGroupReg, setEditGroupReg] = useState<RegRow | null>(null);
```

In `load` (currently line 306), fetch group standings alongside the existing calls:

```ts
  const load = useCallback(async () => {
    if (!id) return;
    const [t, r, p, s, tms, ts, tmatches, gs] = await Promise.all([
      window.api.tournamentsGet(id) as Promise<TourData>,
      window.api.tournamentsRegistrations(id) as Promise<RegRow[]>,
      window.api.playersList() as Promise<any[]>,
      window.api.tournamentsStandings(id) as Promise<StandingRow[]>,
      (window.api as any).tournamentTeamsList(id) as Promise<any[]>,
      (window.api as any).tournamentTeamsStandings(id) as Promise<any[]>,
      (window.api as any).tournamentTeamMatchesList(id) as Promise<any[]>,
      (window.api as any).tournamentsGroupStandings(id) as Promise<any[]>,
    ]);
    setData(t); setRegs(r); setPlayers(p); setStandings(s);
    setTeams(tms); setTeamStandings(ts); setTeamMatches(tmatches);
    setGroupStandings(gs);
    setLoading(false);
  }, [id]);
```

- [ ] **Step 3: Add the Groups tab button and Generate Knockout handler**

In the tab bar array (currently line 562), insert `'groups'` before `'bracket'` — but only render it when the format is mixed. Change:

```tsx
        <div className="flex items-center gap-1 mb-6 mt-4">
          {(['overview', 'registration', 'teams', ...(data.format === 'mixed' ? ['groups'] : []), 'bracket', 'standings'] as const).map(t => (
```

Add a handler near `handleAdvance` (currently line 373):

```ts
  const handleGenerateKnockout = async () => {
    if (!id) return;
    setActionError(null);
    setBusyAction('advance');
    try {
      await (window.api as any).tournamentsGenerateKnockoutFromGroups(id);
      setTab('bracket');
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to generate knockout stage.');
    } finally {
      setBusyAction(null);
    }
  };
```

- [ ] **Step 4: Render the Groups tab content**

Add a new tab section right before the `{/* Bracket */}` block (currently line 816):

```tsx
        {tab === 'groups' && data.format === 'mixed' && (
          <div>
            {(() => {
              const allGroupsComplete = groupStandings.length > 0
                && matches.filter(m => m.groupId).every(m => m.status === 'completed');
              const knockoutAlreadyGenerated = matches.some(m => !m.groupId);
              return (
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-zinc-400">{groupStandings.length} groups</p>
                  {!knockoutAlreadyGenerated && (
                    <button onClick={handleGenerateKnockout} disabled={!allGroupsComplete || busyAction !== null}
                      className="h-8 px-3 text-sm font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 active:scale-[0.97] transition-all disabled:opacity-40">
                      {busyAction === 'advance' ? 'Generating...' : 'Generate Knockout'}
                    </button>
                  )}
                </div>
              );
            })()}
            {groupStandings.map(group => {
              const groupMatches = matches.filter(m => m.groupId === group.groupId);
              const groupRegs = regs.filter(r => r.groupId === group.groupId);
              const groupStarted = groupMatches.some(m => m.status !== 'pending');
              return (
                <div key={group.groupId} className="mb-8">
                  <h3 className="text-sm font-bold text-zinc-700 mb-2">Group {group.groupName}</h3>
                  <div className="space-y-1.5 mb-3">
                    {groupRegs.map(r => (
                      <div key={r.id} className="flex items-center justify-between px-3 py-1.5 bg-white border border-zinc-200/60 rounded-lg">
                        <span className="text-sm text-zinc-700">{r.player1Name}{r.player2Name ? ` / ${r.player2Name}` : ''}</span>
                        {!groupStarted && (
                          <button onClick={() => setEditGroupReg(r)}
                            className="h-6 px-2 text-[11px] font-semibold text-zinc-700 border border-zinc-200 rounded-md hover:bg-zinc-50 active:scale-[0.97] transition-all">
                            Edit Group
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    {groupMatches.map(m => (
                      <div key={m.id} className="bg-white border border-zinc-200/60 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-semibold text-zinc-400 uppercase">{m.round} · Court {m.courtNumber ?? '—'}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${m.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : m.status === 'in_progress' ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-500'}`}>{m.status}</span>
                            {m.status === 'pending' && (
                              <button onClick={() => setEditMatchupMatch(m)}
                                className="h-6 px-2 text-[11px] font-semibold text-zinc-700 border border-zinc-200 rounded-md hover:bg-zinc-50 active:scale-[0.97] transition-all">
                                Edit Matchup
                              </button>
                            )}
                            <button onClick={() => setScoreMatch(m)}
                              className="h-6 px-2 text-[11px] font-semibold text-zinc-700 border border-zinc-200 rounded-md hover:bg-zinc-50 active:scale-[0.97] transition-all">
                              {m.status === 'completed' ? 'Edit Score' : 'Enter Score'}
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-zinc-800 flex-1">{formatTeam(m, 'team1')}</p>
                          <span className="text-sm font-mono font-bold mx-3 text-zinc-400">{m.team1Score != null ? m.team1Score : '—'} : {m.team2Score != null ? m.team2Score : '—'}</span>
                          <p className="text-sm font-bold text-zinc-800 flex-1 text-right">{formatTeam(m, 'team2')}</p>
                        </div>
                        {formatSetScores(m) && <p className="text-[11px] text-zinc-400 text-center mt-1 font-mono">{formatSetScores(m)}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="ag-theme-quartz" style={{ width: '100%' }}>
                    <AgGridReact rowData={group.standings} columnDefs={standingsCols} defaultColDef={{ sortable: true, resizable: true, flex: 1 }} domLayout="autoHeight" rowHeight={32} headerHeight={32} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

```

- [ ] **Step 5: Add `EditGroupModal` and wire it up**

Add a new component in `src/renderer/pages/TournamentDetail.tsx`, right after `EditMatchupModal` (after its closing `}` — currently around line 271):

```tsx
function EditGroupModal({ reg, groups, onClose, onSaved }: {
  reg: RegRow;
  groups: { groupId: string; groupName: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [groupId, setGroupId] = useState(reg.groupId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await (window.api as any).tournamentsReassignGroup(reg.id, groupId);
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to move registration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-[360px]" onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 24px 48px -12px rgba(0,0,0,0.2)', animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <h3 className="text-lg font-bold text-zinc-900 mb-4">Move {reg.player1Name}{reg.player2Name ? ` / ${reg.player2Name}` : ''}</h3>
        <select value={groupId} onChange={e => setGroupId(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400">
          {groups.map(g => <option key={g.groupId} value={g.groupId}>Group {g.groupName}</option>)}
        </select>
        {error && <p className="mt-3 text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 rounded-xl">Cancel</button>
          <button onClick={handleSave} disabled={saving || !groupId} className="px-5 py-2 text-sm font-semibold bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 disabled:opacity-40">Save</button>
        </div>
      </div>
    </div>
  );
}
```

Render it near the other modals at the bottom of `TournamentDetail` (right after the `{editMatchupMatch && (...)}` block, currently around line 909):

```tsx
      {editGroupReg && (
        <EditGroupModal
          reg={editGroupReg}
          groups={groupStandings.map(g => ({ groupId: g.groupId, groupName: g.groupName }))}
          onClose={() => setEditGroupReg(null)}
          onSaved={() => { setEditGroupReg(null); load(); }}
        />
      )}
```

- [ ] **Step 6: Run renderer typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/renderer/pages/Tournaments.tsx src/renderer/pages/TournamentDetail.tsx
git commit -m "feat: add Groups tab, group creation form, and Edit Group UI"
```

---

## Task 10: End-to-end manual verification

**Files:** none (verification only)

**Interfaces:** none — this task exercises the full stack built in Tasks 1–9.

- [ ] **Step 1: Build**

```bash
npm run build:main && npx vite build
```

Expected: both succeed with no errors.

- [ ] **Step 2: Run the full unit test suite**

```bash
npx vitest run src/__tests__
```

Expected: all tests pass, including the new ones from Tasks 2–5.

- [ ] **Step 3: Launch the app and drive a full mixed-format flow**

This repo's Electron binary is a Windows `.exe`; launch it directly with a CDP debug port and drive it via `Runtime.evaluate` over the raw DevTools protocol (Playwright's `_electron.launch()` handshake does not work from WSL in this environment — this was already established and worked earlier in this session). Script outline:

```js
// 1. window.api.tournamentsCreate({..., format: 'mixed', groupCount: 4, advancePerGroup: 2})
// 2. window.api.tournamentsRegister(...) x8 (or more) using window.api.playersList()
// 3. window.api.tournamentsGenerateBracket(tournamentId)
// 4. window.api.tournamentsGet(tournamentId) -> assert 4 groups' worth of matches, each tagged with a groupId
// 5. window.api.tournamentsGroupStandings(tournamentId) -> assert 4 groups returned
// 6. Score every group match via window.api.tournamentsSetScore (team1 always wins, e.g. [[21,15],[21,15]])
// 7. window.api.tournamentsGenerateKnockoutFromGroups(tournamentId)
// 8. window.api.tournamentsGet(tournamentId) -> assert new matches with groupId === null, and none of them
//    pair two entrants who shared a groupId in the group stage
// 9. Screenshot the Groups tab and the Bracket tab in the running UI
```

Expected: qualifiers advance correctly, no same-group pairing in the first knockout round, screenshots show the Groups tab with per-group standings and the Bracket tab with the generated knockout round.

- [ ] **Step 4: Verify the `EditGroupModal` and `EditMatchup` group-scoping fix**

In the same running app: before scoring any group matches, open "Edit Group" on one registration and move it to a different group; confirm both groups' schedules regenerate (`window.api.tournamentsGet` shows updated `groupId` on registrations and matches). Then open "Edit Matchup" on a group-A match and confirm the round-mate exclusion only considers group A's matches (not group B's, even though both groups have a match named `R1`) — e.g. by checking `window.api.tournamentsReassignMatch` does not throw "That team already has a pending match this round" for a team that's only busy in a different group's same-named round.

- [ ] **Step 5: Report results**

Summarize pass/fail for each step above. If anything fails, return to the relevant task (do not patch ad hoc) — this is a verification task, not a fix-it task.

---

## Self-Review Notes

- **Spec coverage:** every bullet in the spec's Requirements section maps to a task — creation-time config (Task 5), snake seeding (Task 2), reused round-robin/scoring (Task 6, no new code), group-to-knockout pairing (Task 3, 7), manual group adjustment (Task 4, 8), Edit Matchup reuse (Task 8's scoping fix makes the reuse actually correct), UI (Task 9).
- **Type consistency:** `TournamentGroup`, `GroupStanding`, `assignRegistrationsToGroups`, `buildFirstKnockoutRound`, `validateGroupReassignment`, `validateGroupTournamentConfig` are defined once (Tasks 2–5) and referenced by the same names in every later task (7–9).
- **Extra fix folded in:** Task 8 fixes `tournaments:reassignMatch`'s round-scoping query — this is required for correctness once `groupId` exists (round names repeat across groups) and is called out explicitly rather than silently bundled.
