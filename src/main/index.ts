import { app, BrowserWindow, dialog, globalShortcut, shell } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc';
import { closeDb } from './database';
import { navigateWithReadyToShowListener, StartupCoordinator } from './startup';

let mainWindow: BrowserWindow | null = null;
const startup = new StartupCoordinator();

function handleStartupFailure(error: unknown) {
  console.error('AutoRally startup failed:', error);
  dialog.showErrorBox('AutoRally 启动失败', 'AutoRally 未能正常启动。请重启应用后重试。');
  app.quit();
}

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
      mainWindow?.webContents.send('shortcut:end-session');
    } else if (key === 'f' && !input.shift) {
      mainWindow?.webContents.send('shortcut:search-player');
    }
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

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => startup.focusActiveWindow());

  app
    .whenReady()
    .then(async () => {
      await createSplashWindow();
      await registerIpcHandlers();
      await createWindow();
      registerShortcuts();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          void createWindow().catch(handleStartupFailure);
        }
      });
    })
    .catch(handleStartupFailure);
}

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  closeDb();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
