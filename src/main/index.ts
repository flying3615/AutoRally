import { app, BrowserWindow, globalShortcut } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc';
import { closeDb } from './database';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'AutoRally - Badminton Club Manager',
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerShortcuts() {
  // ⌘N — new session
  globalShortcut.register('CommandOrControl+N', () => {
    mainWindow?.webContents.send('shortcut:new-session');
  });

  // ⌘W — end session
  globalShortcut.register('CommandOrControl+W', () => {
    mainWindow?.webContents.send('shortcut:end-session');
  });

  // ⌘E — export
  globalShortcut.register('CommandOrControl+E', () => {
    mainWindow?.webContents.send('shortcut:export');
  });

  // ⌘Shift+N — add player
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    mainWindow?.webContents.send('shortcut:add-player');
  });

  // ⌘F — search player
  globalShortcut.register('CommandOrControl+F', () => {
    mainWindow?.webContents.send('shortcut:search-player');
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

app.whenReady().then(async () => {
  await registerIpcHandlers();
  createWindow();
  registerShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  closeDb();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
