# Historical Data Cleanup Design

## Goal

Let an administrator permanently remove historical club data while requiring an explicit typed confirmation. The operation must preserve the current operating state.

## Scope

The cleanup removes:

- Every payment and top-up record.
- Completed daily sessions and their attendance and game records.
- Tournaments marked completed or dated before today, with their registrations, standings, teams, team rosters, team matches, and tournament matches.

The cleanup preserves:

- Players, player balances, and settings.
- Upcoming sessions.
- Active daily sessions and their attendance and games.
- Non-completed tournaments dated today or later.

## User Experience

Settings gains a danger-zone section below data backup. It explains the exact deletion and preservation scope and provides a `Clear Historical Data` button.

Clicking the button opens a dedicated destructive-action dialog. The dialog repeats the permanent consequences and requires the user to type the Chinese phrase `清理`. The final red confirmation button stays disabled until the phrase exactly matches. Cancelling, dismissing, or entering a different value performs no deletion.

After a successful cleanup, Settings reports the deletion counts and refreshes application state. A failed cleanup presents the error without reporting success.

## Architecture

A new preload API exposes one narrow `data:clearHistory` IPC operation. The main-process handler owns all deletion logic; the renderer cannot supply SQL or choose which tables to delete.

The main process executes the cleanup in one database transaction. It deletes dependent rows before their parents to satisfy existing foreign-key relationships:

1. Delete all payments and top-ups.
2. Delete games and completed daily sessions. Attendance is removed by the existing cascade.
3. Delete records related to tournaments marked completed or dated before today in dependency order: tournament matches, standings, team rosters, team matches, teams, registrations, and finally tournaments.

The handler returns typed counts for user feedback. If any statement fails, the transaction rolls back and the error reaches the renderer.

## Alternatives Considered

1. Settings danger zone with typed confirmation: recommended because it is explicit, localized to other data operations, and meets the requested scope without adding configuration.
2. Mandatory backup export first: safer but adds an unnecessary file-selection step and can interrupt an otherwise intentional cleanup.
3. A dedicated maintenance page with filters: flexible but excessive for deleting all historical data.

## Testing

Backend tests will seed both removable and protected data, invoke the cleanup logic, and assert that all removable records are gone while protected rows and balances remain. They will also cover transaction rollback on failure.

Renderer tests will cover disabled confirmation until `清理` is entered, cancellation, successful cleanup feedback, and surfaced failures.
