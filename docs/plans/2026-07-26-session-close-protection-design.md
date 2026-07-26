# Session close protection design

## Goal

Prevent an active badminton session from being accidentally left open when the
user closes AutoRally. The user must explicitly choose whether to end the
session before the application exits.

## Behaviour

1. When the app receives a close request, the main process queries for all
   active sessions.
2. If no session is active, the app closes normally for that request and
   checks again for a later close request.
3. If one or more sessions are active, a native confirmation dialog offers:
   - **Cancel close**: keep the application and session running without
     changing persisted data.
   - **End and close**: mark every active session as completed, set each end
     time using the existing safe end-time logic, then synchronously persist
     the completed set once before exiting the app.
4. The same protection applies to application-initiated exit requests, so the
   current `app:quit` route cannot bypass the guard.

## Architecture

The guard belongs in Electron's main process because it receives all native
window-close and app-quit events. It uses the existing database session records
as the source of truth rather than renderer state, which may be stale or
unavailable during shutdown.

The close handler prevents the first close event while it evaluates the active
sessions and awaits user intent. It sets an in-memory approval flag only after
all active sessions have been completed and persisted successfully; the flag
allows the follow-up close event to complete without showing the dialog a
second time.

The session-ending write shares the existing status and end-time semantics used
by the `sessions:end` IPC handler to avoid divergent lifecycle behaviour.

## Error handling

The close request remains blocked unless the completion update succeeds. On
failure, the synchronous completion save first cancels any pending autosave,
then every completed active session is restored in memory without scheduling
another persistence attempt. If marking a later session fails, previously
marked sessions are likewise restored. Closing is blocked, and a native error
dialog explains that the session was not ended and the program remains open for
a later retry.
The dialog contains only fixed Chinese user-safe explanatory text; it never
includes diagnostic error details. The main-process reporter logs the original
error (including persistence and restoration failures) for diagnosis.

## Verification

Tests cover closing with no active session, cancelling the dialog, confirming
end-and-close, completing multiple active sessions atomically, and the
follow-up close event that must not prompt twice.
