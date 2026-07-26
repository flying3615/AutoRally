# Match Repeat Prevention Design

## Goal

Prevent the next generated round from reusing the same four-player court when
another valid arrangement exists. Also reduce repeated partners and opponents
without sacrificing court capacity, rest rotation, or equal playing time.

## Current Cause

`generateMatches` builds `opponentCount` from game history but never uses it in
candidate or search-state scoring. It only uses partnership history after a
four-player group has already been selected. Therefore, a prior court's player
set has no repeat penalty and can be selected again in the next round.

## Chosen Approach

Use a layered, soft scoring model:

1. Preserve the existing primary constraints: fill courts, prioritize players
   who have rested, and keep played-game counts fair.
2. Add a per-candidate penalty when its sorted set of four player IDs exactly
   matches a court in the latest completed or playing round.
3. Add partner and opponent repeat penalties for the selected team partition.
4. Compare those diversity penalties before level spread and team-level
   balance, so an equally fair alternative rotates the group, partners, and
   opponents.
5. Allow a repeated group only when no valid alternative exists, such as an
   exactly four-player pool or restrictive level/gender combinations.

Hard-excluding a prior four-player group was rejected because it can leave
courts unfilled in constrained sessions.

## Tests

Add regression coverage using eight same-level players on two courts:

- The next round must not reproduce either previous four-player group when all
  eight players can be repartitioned.
- The next round must not retain the prior partners or opponents when valid
  alternatives exist.
- Existing fairness, rest-rotation, level, and constrained-pool behavior
  remains covered by the existing matching suite.
