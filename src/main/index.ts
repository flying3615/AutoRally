import { app, BrowserWindow, dialog, globalShortcut, shell } from 'electron';
import path from 'path';
import { createAppLifecycle } from './appLifecycle';
import { registerIpcHandlers } from './ipc';
import { closeDb, queryAll, run, runWithoutAutosave, saveDb } from './database';
import {
  createStartupFailureHandler,
  navigateWithReadyToShowListener,
  presentStartupFailureDialog,
  runStartupSequence,
  StartupCoordinator,
} from './startup';
import {
  completeSessionsForClose,
  createSessionCloseCompletionDependencies,
} from './sessionCloseCompletion';
import { sessionCloseErrorMessage } from './sessionCloseErrorMessage';
import { handleSessionCloseEvent, SessionCloseGuard } from './sessionCloseGuard';

let mainWindow: BrowserWindow | null = null;
const startup = new StartupCoordinator();

const handleStartupFailure = createStartupFailureHandler({
  report: error => {
    console.error('AutoRally startup failed:', error);
    presentStartupFailureDialog({ showErrorBox: dialog.showErrorBox });
  },
  exit: () => app.quit(),
});

async function createSplashWindow() {
  const splashWindow = new BrowserWindow({
    width: 360,
    height: 240,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  startup.setSplashWindow(splashWindow);
  splashWindow.setMenuBarVisibility(false);

  splashWindow.on('closed', () => {
    startup.setSplashWindow(null);
  });

  const { navigation: splashNavigation, readyToShow: splashReadyToShow } =
    navigateWithReadyToShowListener(splashWindow, () => {
      if (process.env.VITE_DEV_SERVER_URL) {
        return splashWindow.loadURL(new URL('splash.html', process.env.VITE_DEV_SERVER_URL).toString());
      }

      return splashWindow.loadFile(path.join(__dirname, '../renderer/splash.html'));
    });

  await Promise.all([splashNavigation, splashReadyToShow]);
  startup.showSplashWindow();
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'AutoRally - Badminton Club Manager',
  });
  mainWindow = window;
  startup.setPendingMainWindow(window);

  const sessionCloseGuard = new SessionCloseGuard(
    () => queryAll<{ id: string; startTime: string | null }>(
      "SELECT id, startTime FROM sessions WHERE status = 'active'",
    ),
    () => dialog.showMessageBoxSync(window, {
      type: 'warning',
      buttons: ['Cancel', 'End Session and Close'],
      defaultId: 0,
      cancelId: 0,
      message: 'An active session is in progress.',
      detail: 'The session will be ended before AutoRally closes.',
    }) === 1,
    sessions => completeSessionsForClose(
      sessions,
      createSessionCloseCompletionDependencies({
        run,
        runWithoutAutosave,
        saveDb,
        now: () => new Date().toISOString(),
      }),
    ),
  );

  window.setAutoHideMenuBar(true);

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(err => console.error('Failed to open external link:', err));
    }
    return { action: 'deny' };
  });

  const { navigation: mainNavigation, readyToShow } = navigateWithReadyToShowListener(window, () => {
    if (process.env.VITE_DEV_SERVER_URL) {
      return window.loadURL(process.env.VITE_DEV_SERVER_URL);
    }

    return window.loadFile(path.join(__dirname, '../renderer/index.html'));
  });

  window.webContents.on('before-input-event', (_event, input) => {
    if (!input.control && !input.meta) return;
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (key === 'w') {
      window.webContents.send('shortcut:end-session');
    } else if (key === 'f' && !input.shift) {
      window.webContents.send('shortcut:search-player');
    }
  });

  window.on('close', event => {
    handleSessionCloseEvent(sessionCloseGuard, event, error => {
      console.error('Failed to finish the active session during app close; keeping the application open.', error);
      dialog.showMessageBoxSync(window, {
        type: 'error',
        message: 'Unable to End Active Session',
        detail: sessionCloseErrorMessage(error),
      });
    });
  });

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
    startup.setPendingMainWindow(null);
    startup.setMainWindow(null);
    startup.closeSplashWindow();
  });

  await Promise.all([mainNavigation, readyToShow]);
  startup.showMainWindow();
}

function registerShortcuts() {
  // ⌘N — new session
  globalShortcut.register('CommandOrControl+N', () => {
    mainWindow?.webContents.send('shortcut:new-session');
  });

  // ⌘E — export
  globalShortcut.register('CommandOrControl+E', () => {
    mainWindow?.webContents.send('shortcut:export');
  });

  // ⌘Shift+N — add player
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    mainWindow?.webContents.send('shortcut:add-player');
  });

  // ⌘Ctrl+F — fullscreen
  globalShortcut.register('CommandOrControl+Control+F', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  // ⌘+ — zoom in
  globalShortcut.register('CommandOrControl+=', () => {
    if (mainWindow) {
      const factor = mainWindow.webContents.getZoomFactor();
      mainWindow.webContents.setZoomFactor(Math.min(factor + 0.1, 3));
    }
  });

  // ⌘- — zoom out
  globalShortcut.register('CommandOrControl+-', () => {
    if (mainWindow) {
      const factor = mainWindow.webContents.getZoomFactor();
      mainWindow.webContents.setZoomFactor(Math.max(factor - 0.1, 0.5));
    }
  });

  // ⌘0 — reset zoom
  globalShortcut.register('CommandOrControl+0', () => {
    mainWindow?.webContents.setZoomFactor(1);
  });

  // ⌘, — settings
  globalShortcut.register('CommandOrControl+,', () => {
    mainWindow?.webContents.send('shortcut:settings');
  });
}

const appLifecycle = createAppLifecycle({
  platform: process.platform,
  quit: () => app.quit(),
  unregisterShortcuts: () => globalShortcut.unregisterAll(),
  closeDb,
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => startup.focusActiveWindow());

  app
    .whenReady()
    .then(() => {
      return runStartupSequence({
        createSplashWindow,
        initializeIpc: registerIpcHandlers,
        createMainWindow: createWindow,
        registerShortcuts,
        onFailure: handleStartupFailure,
      });
    })
    .then(started => {
      if (!started) return;

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          void createWindow().catch(handleStartupFailure);
        }
      });
    })
    .catch(handleStartupFailure);
}

app.on('window-all-closed', () => {
  appLifecycle.handleWindowAllClosed();
});

app.on('will-quit', () => {
  appLifecycle.handleWillQuit();
});
