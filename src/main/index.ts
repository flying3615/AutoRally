import { app, BrowserWindow, dialog, globalShortcut, shell } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc';
import { closeDb, queryOne, run, saveDb } from './database';
import {
  completeSessionForClose,
  SessionCloseCompletionRestoreError,
} from './sessionCloseCompletion';
import { safeSessionEndTime } from './sessionDuration';
import { handleSessionCloseEvent, SessionCloseGuard } from './sessionCloseGuard';

let mainWindow: BrowserWindow | null = null;

function safeErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) return '发生未知错误。';

  const [firstLine = ''] = error.message.split(/\r?\n/, 1);
  const detail = firstLine.trim();
  if (!detail) return '发生未知错误。';

  return detail
    .replace(/(?:[A-Za-z]:)?(?:\/|\\)(?:[^/\s\\]+(?:\/|\\)?)*/g, '[路径已隐藏]')
    .slice(0, 500);
}

function closeFailureDetail(error: unknown): string {
  if (error instanceof SessionCloseCompletionRestoreError) {
    return `保存会话失败：${safeErrorDetail(error.persistenceError)}\n恢复会话失败：${safeErrorDetail(error.restorationError)}`;
  }

  if (
    error instanceof Error
    && error.name === 'AggregateError'
    && 'errors' in error
    && Array.isArray(error.errors)
  ) {
    return `保存会话失败：${safeErrorDetail(error.errors[0])}\n恢复会话失败：${safeErrorDetail(error.errors[1])}`;
  }

  return `错误详情：${safeErrorDetail(error)}`;
}

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
    session => completeSessionForClose(session, {
      markCompleted: selected => {
        run("UPDATE sessions SET endTime = ?, status = 'completed' WHERE id = ?", [
          safeSessionEndTime(selected.startTime, new Date().toISOString()),
          selected.id,
        ]);
      },
      persist: saveDb,
      restoreActive: selected => {
        run("UPDATE sessions SET endTime = NULL, status = 'active' WHERE id = ?", [selected.id]);
      },
    }),
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
      dialog.showMessageBoxSync(mainWindow!, {
        type: 'error',
        message: '无法结束当前会话',
        detail: `当前会话未结束，程序将保持打开。您可以稍后重试。\n\n${closeFailureDetail(error)}`,
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
