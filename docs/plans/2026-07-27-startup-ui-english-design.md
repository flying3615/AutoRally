# Startup UI English Design

## Goal

Keep every user-visible part of the startup experience in English.

## Scope

Replace the Chinese loading message in `public/splash.html` with
`Preparing AutoRally...`.

Replace the Chinese startup-failure dialog title and message in
`src/main/index.ts` with:

- `AutoRally Failed to Start`
- `AutoRally could not start. Please restart the application and try again.`

## Compatibility

Do not change startup sequencing, error reporting, or exit behavior. Preserve
Chinese CSV header and gender-value support because it is import-data
compatibility, not user-interface copy.

## Tests

Extend the startup failure regression coverage to assert the English dialog
copy through its testable failure-reporting boundary. Verify the splash page
contains the English loading copy and no user-visible Chinese text.
