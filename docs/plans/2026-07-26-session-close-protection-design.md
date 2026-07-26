# Session close protection design

## Goal

Prevent an active badminton session from being accidentally left open when the
user closes AutoRally. The user must explicitly choose whether to end the
session before the application exits.

## Behaviour

1. When the app receives a close request, the main process queries for an
   active session.
2. If no session is active, the app closes normally.
3. If a session is active, a native confirmation dialog offers:
   - **Cancel close**: keep the application and session running without
     changing persisted data.
   - **End and close**: mark the active session as completed, set its end time
     using the existing safe end-time logic, then exit the app.
4. The same protection applies to application-initiated exit requests, so the
   current `app:quit` route cannot bypass the guard.

## Architecture

The guard belongs in Electron's main process because it receives all native
window-close and app-quit events. It uses the existing database session records
as the source of truth rather than renderer state, which may be stale or
unavailable during shutdown.

The close handler prevents the first close event while it evaluates the active
session and awaits user intent. Once ending succeeds, an in-memory approval
flag allows the follow-up close event to complete without showing the dialog a
second time.

The session-ending write shares the existing status and end-time semantics used
by the `sessions:end` IPC handler to avoid divergent lifecycle behaviour.

## Error handling

The close request remains blocked unless the completion update succeeds. A
failed write must surface through the existing main-process error path rather
than quitting with an active session left unintentionally unresolved.

## Verification

Tests cover closing with no active session, cancelling the dialog, confirming
end-and-close, and the follow-up close event that must not prompt twice.
