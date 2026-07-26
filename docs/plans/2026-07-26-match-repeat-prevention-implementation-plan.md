# Match Repeat Prevention Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent consecutive four-player court repeats and prefer fresh partners
and opponents when an equally fair, valid alternative exists.

**Architecture:** `generateMatches` already enumerates four-player court
candidates and selects a non-overlapping set with lexicographic scoring. Extend
that score with a penalty for a candidate that exactly repeats a latest-round
court, and with the already-recorded partner/opponent relationship counts.
Keep court capacity, rest urgency, and play-count fairness ahead of diversity,
then rank diversity before level and team-balance preferences.

**Tech Stack:** TypeScript, Vitest, React renderer service.

---

### Task 1: Add a failing consecutive-repeat regression test

**Files:**
- Modify: `src/__tests__/matching.test.ts:298-328`
- Test: `src/__tests__/matching.test.ts`

**Step 1: Write the failing test**

Replace the existing opponent-only test with a two-court previous round. Use
eight level-3 mixed players and these completed round-one games:

```ts
const pastGames: Game[] = [
  {
    id: 'g1', sessionId: 's', courtNumber: 1,
    team1Player1Id: 'm1', team1Player2Id: 'f1',
    team2Player1Id: 'm2', team2Player2Id: 'f2',
    status: 'completed', roundNumber: 1, gameType: 'mixed',
    startedAt: null, endedAt: null,
  },
  {
    id: 'g2', sessionId: 's', courtNumber: 2,
    team1Player1Id: 'm3', team1Player2Id: 'f3',
    team2Player1Id: 'm4', team2Player2Id: 'f4',
    status: 'completed', roundNumber: 1, gameType: 'mixed',
    startedAt: null, endedAt: null,
  },
];
```

Generate two round-two courts and assert:

```ts
const courtKey = (ids: string[]) => [...ids].sort().join('|');
const previousGroups = new Set(
  pastGames.map(game => courtKey([
    game.team1Player1Id, game.team1Player2Id,
    game.team2Player1Id, game.team2Player2Id,
  ])),
);

expect(result).toHaveLength(2);
expect(result.every(match =>
  !previousGroups.has(courtKey([...match.team1, ...match.team2])),
)).toBe(true);
```

Add helpers that count repeated historical partner pairs and repeated
historical opponent pairs. Assert that no prior partner pair remains a team
and that the total repeated relationships is `4`, the minimum possible when
two former four-player groups must be repartitioned into two courts:

```ts
expect(repeatedPartnerPairs).toBe(0);
expect(repeatedPartnerPairs + repeatedOpponentPairs).toBe(4);
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/__tests__/matching.test.ts
```

Expected: the new assertion fails because the current algorithm can reuse a
previous four-player court and `opponentCount` does not affect scoring.

### Task 2: Score last-round groups and opponent repetition

**Files:**
- Modify: `src/renderer/services/matching.ts:26-51`
- Modify: `src/renderer/services/matching.ts:62-95`
- Modify: `src/renderer/services/matching.ts:212-230`
- Modify: `src/renderer/services/matching.ts:279-345`
- Test: `src/__tests__/matching.test.ts`

**Step 1: Extend candidate and state scores**

Add these numeric fields to both `CourtCandidate` and `SearchState`:

```ts
groupRepeatPenalty: number;
opponentPenalty: number;
```

Initialize them to zero in the empty search state and accumulate them when a
candidate is added to a state.

**Step 2: Compare diversity before level preference**

In both `compareCandidate` and `compareState`, retain the existing order for
court count, rest urgency, and game-count fairness. Immediately afterward
compare:

```ts
a.groupRepeatPenalty - b.groupRepeatPenalty ||
a.partnerPenalty - b.partnerPenalty ||
a.opponentPenalty - b.opponentPenalty ||
```

Keep level spread, game type, team balance, wait time, and tie break after
those diversity dimensions.

**Step 3: Record previous round court groups**

After `roundsDesc` is computed, record each sorted set of four IDs from the
most recent non-pending round:

```ts
const latestRound = roundsDesc[0];
const latestRoundGroups = new Set(
  latestRound === undefined
    ? []
    : countedGames
      .filter(g => g.roundNumber === latestRound)
      .map(g => [
        g.team1Player1Id, g.team1Player2Id,
        g.team2Player1Id, g.team2Player2Id,
      ].sort().join('|')),
);
```

Use the same sorted candidate `key` in `addCandidate` to calculate:

```ts
const groupRepeatPenalty = latestRoundGroups.has(key) ? 1 : 0;
```

This applies only to the most recent completed or playing round and naturally
falls back when no alternative candidate is available.

**Step 4: Score selected opposing pairs**

When evaluating each team partition, calculate its repeated opponents from the
existing `opponentCount` map:

```ts
const opponents = t1.reduce((sum, player1) =>
  sum + t2.reduce((opponentSum, player2) =>
    opponentSum + (opponentCount.get(pairKey(player1.id, player2.id)) ?? 0), 0
  ), 0
);
```

Include `opponents` in the `bestTeams` shape and its tiebreak ordering after
`partners`. Assign `groupRepeatPenalty` and `opponentPenalty:
bestTeams.opponents` when storing the candidate.

**Step 5: Run the focused test to verify it passes**

Run:

```bash
npx vitest run src/__tests__/matching.test.ts
```

Expected: PASS, including the new regression test and all matching simulations.

### Task 3: Verify type safety and commit the focused fix

**Files:**
- Modify: `src/renderer/services/matching.ts`
- Modify: `src/__tests__/matching.test.ts`

**Step 1: Run type checking**

Run:

```bash
npm run typecheck
```

Expected: PASS with no TypeScript errors.

**Step 2: Review the focused diff**

Run:

```bash
git diff --check
git diff -- src/renderer/services/matching.ts src/__tests__/matching.test.ts
```

Expected: only the planned scoring fields, comparisons, latest-round group
lookup, opponent scoring, and regression test are present.

**Step 3: Commit**

```bash
git add src/renderer/services/matching.ts src/__tests__/matching.test.ts
git commit -m "fix(matching): rotate repeated player groups" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
