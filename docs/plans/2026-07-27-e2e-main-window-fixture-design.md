# E2E Main Window Fixture Design

## Goal

Restore the complete Electron E2E suite after the startup splash screen caused
the test fixture to select a transient window instead of the application window.

## Cause

The `page` fixture calls `app.firstWindow()`. During startup this returns the
splash window. The fixture waits for the renderer API and navigation element on
that page, but the startup coordinator closes it when the main window becomes
ready. Every test therefore fails before its test body runs.

## Chosen Approach

The fixture will select the main renderer window by its `index.html` URL.

1. Check the Electron application's existing windows for the main renderer.
2. If it has not been created yet, wait for a future `window` event that matches
   the main renderer URL.
3. Wait for the selected main window's preload API and navigation element before
   passing it to a test.

This keeps the production splash lifecycle unchanged and makes the fixture
explicit about the window that every existing E2E test requires.

## Verification

Use the existing failing check-in test as the regression reproduction, then run
the complete `npm run test:e2e` suite to confirm all existing Electron flows use
the main window successfully.
