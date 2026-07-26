import { app, BrowserWindow, dialog, globalShortcut, shell } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc';
import { closeDb, queryOne, run, runWithoutAutosave, saveDb } from './database';
import {
  completeSessionForClose,
  createSessionCloseCompletionDependencies,
} from './sessionCloseCompletion';
import { sessionCloseErrorMessage } from './sessionCloseErrorMessage';
import { handleSessionCloseEvent, SessionCloseGuard } from './sessionCloseGuard';

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

  const sessionCloseGuard = new SessionCloseGuard(
    () => queryOne<{ id: string; startTime: string | null }>("SELECT id, startTime FROM sessions WHERE status = 'active'"),
    () => dialog.showMessageBoxSync(mainWindow!, {
      type: 'warning',
      buttons: ['取消关闭', '结束并关闭'],
      defaultId: 0,
      cancelId: 0,
      message: '当前 session 正在进行中',
      detail: '结束 session 后将关闭程序。',
    }) === 1,
    session => completeSessionForClose(
      session,
      createSessionCloseCompletionDependencies({
        run,
        runWithoutAutosave,
        saveDb,
        now: () => new Date().toISOString(),
      }),
    ),
  );

  mainWindow.setAutoHideMenuBar(true);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(err => console.error('Failed to open external link:', err));
    }
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (!input.control && !input.meta) return;
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (key === 'w') {
      mainWindow?.webContents.send('shortcut:end-session');
    } else if (key === 'f' && !input.shift) {
      mainWindow?.webContents.send('shortcut:search-player');
    }
  });

  mainWindow.on('close', event => {
    handleSessionCloseEvent(sessionCloseGuard, event, error => {
      console.error('Failed to finish the active session during app close; keeping the application open.', error);
      dialog.showMessageBoxSync(mainWindow!, {
        type: 'error',
        message: '无法结束当前会话',
        detail: sessionCloseErrorMessage(error),
      });
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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
