# Startup Splash Screen Design

## Goal

Provide immediate, explicit feedback while AutoRally starts and ensure a second
launch request focuses the existing application instead of creating another
process.

## Current Cause

The main process awaits IPC registration before creating its only browser
window. This leaves users without a visible response during initialization and
does not prevent multiple application instances from being launched.

## Chosen Approach

Use a small, native Electron splash window and Electron's single-instance lock.

1. Request the single-instance lock as the process starts. If it cannot be
   acquired, quit immediately.
2. On a second launch request, restore and focus the splash window while the
   application is loading; otherwise restore and focus the main window.
3. Once Electron is ready, create the splash window immediately, then register
   IPC handlers asynchronously.
4. Create the main window hidden. When its content is ready to show, present
   it, close the splash window, and clear the splash reference.
5. Use a dedicated local HTML page in the main-process build output for the
   splash content. It will use the existing light, green-accented AutoRally
   visual language and show the product name, a badminton motif, and an
   indeterminate loading indicator.

## Window Lifecycle

The splash window is compact, fixed-size, frameless, non-resizable, and has no
menu. It is created only for the initial startup, not when macOS activates an
application with no open windows.

If the main window closes before its content is ready, the splash window closes
with it. Existing application shutdown cleanup remains responsible for shortcut
and database cleanup. Failures during IPC registration continue to surface
rather than being converted into a false successful startup.

## Tests

Extract the startup orchestration into dependency-injectable logic and add
unit coverage for:

- quitting when the single-instance lock is unavailable;
- focusing the splash window, then the main window, on subsequent launch
  requests;
- showing the main window and closing the splash window after its
  `ready-to-show` event.

Run the targeted startup tests together with the existing type check and build.
