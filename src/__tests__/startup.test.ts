import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createStartupFailureHandler,
  navigateWithReadyToShowListener,
  presentStartupFailureDialog,
  runStartupSequence,
  StartupCoordinator,
  waitForReadyToShow,
} from '../main/startup';

describe('startup UI copy', () => {
  it('uses the approved English splash copy', () => {
    const splashSource = readFileSync(resolve(process.cwd(), 'public/splash.html'), 'utf8');

    expect(splashSource).toContain('Preparing AutoRally...');
    expect(splashSource).not.toContain('正在准备应用');
  });
});

describe('startup failure dialog', () => {
  it('presents the approved English startup failure copy', () => {
    const showErrorBox = vi.fn();

    presentStartupFailureDialog({ showErrorBox });

    expect(showErrorBox).toHaveBeenCalledOnce();
    expect(showErrorBox).toHaveBeenCalledWith(
      'AutoRally Failed to Start',
      'AutoRally could not start. Please restart the application and try again.',
    );
  });
});

class SplashWindowEventSource {
  private readyToShowListener: (() => void) | undefined;
  private closedListener: (() => void) | undefined;
  readonly events: string[] = [];

  once(event: 'ready-to-show' | 'closed', listener: () => void) {
    this.events.push(event);
    if (event === 'ready-to-show') {
      this.readyToShowListener = listener;
    } else {
      this.closedListener = listener;
    }
  }

  emitReadyToShow() {
    this.readyToShowListener?.();
  }

  emitClosed() {
    this.closedListener?.();
  }
}

class NavigatingWindowEventSource extends SplashWindowEventSource {
  navigate() {
    this.events.push('navigate');
    this.emitReadyToShow();
  }
}

function createWindowFake({ minimized = false }: { minimized?: boolean } = {}) {
  return {
    isMinimized: vi.fn(() => minimized),
    restore: vi.fn(),
    focus: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
  };
}

describe('StartupCoordinator', () => {
  it('subscribes to ready-to-show before navigation can emit it', async () => {
    const window = new NavigatingWindowEventSource();
    let proceeded = false;

    const { readyToShow } = navigateWithReadyToShowListener(window, () => window.navigate());
    await readyToShow.then(() => {
      proceeded = true;
    });

    expect(window.events).toEqual(['ready-to-show', 'closed', 'navigate']);
    expect(proceeded).toBe(true);
  });

  it('waits until the splash window is ready to show', async () => {
    const splashWindow = new SplashWindowEventSource();
    let proceeded = false;
    const ready = waitForReadyToShow(splashWindow).then(() => {
      proceeded = true;
    });

    await Promise.resolve();

    expect(splashWindow.events).toEqual(['ready-to-show', 'closed']);
    expect(proceeded).toBe(false);

    splashWindow.emitReadyToShow();
    await ready;

    expect(proceeded).toBe(true);
  });

  it('rejects when the window closes before it is ready to show', async () => {
    const window = new SplashWindowEventSource();
    const ready = waitForReadyToShow(window);

    window.emitClosed();

    await expect(ready).rejects.toThrow('closed before it was ready to show');
  });

  it('resolves when the window is ready before it closes', async () => {
    const window = new SplashWindowEventSource();
    const ready = waitForReadyToShow(window);

    window.emitReadyToShow();
    window.emitClosed();

    await expect(ready).resolves.toBeUndefined();
  });

  it('defers splash focus until the registered splash becomes visible', () => {
    const splash = createWindowFake();
    const startup = new StartupCoordinator();
    startup.setSplashWindow(splash);

    startup.focusActiveWindow();

    expect(splash.focus).not.toHaveBeenCalled();

    startup.showSplashWindow();

    expect(splash.show).toHaveBeenCalledOnce();
    expect(splash.focus).toHaveBeenCalledOnce();
  });

  it('fulfills an early focus request when the splash becomes visible', () => {
    const splash = createWindowFake();
    const startup = new StartupCoordinator();

    startup.focusActiveWindow();
    startup.setSplashWindow(splash);

    expect(splash.focus).not.toHaveBeenCalled();

    startup.showSplashWindow();

    expect(splash.show).toHaveBeenCalledOnce();
    expect(splash.focus).toHaveBeenCalledOnce();
  });

  it('restores and focuses the minimized main window after startup', () => {
    const main = createWindowFake({ minimized: true });
    const startup = new StartupCoordinator();
    startup.setMainWindow(main);

    startup.focusActiveWindow();

    expect(main.restore).toHaveBeenCalledOnce();
    expect(main.focus).toHaveBeenCalledOnce();
  });

  it('keeps the splash active until the pending main window is ready', () => {
    const splash = createWindowFake();
    const main = createWindowFake();
    const startup = new StartupCoordinator();
    startup.setSplashWindow(splash);
    startup.setPendingMainWindow(main);
    startup.showSplashWindow();

    startup.focusActiveWindow();

    expect(splash.focus).toHaveBeenCalledOnce();
    expect(main.focus).not.toHaveBeenCalled();

    startup.showMainWindow();
    startup.focusActiveWindow();

    expect(main.show).toHaveBeenCalledOnce();
    expect(main.focus).toHaveBeenCalledOnce();
  });

  it('shows the main window and closes the splash window when ready', () => {
    const splash = createWindowFake();
    const main = createWindowFake();
    const startup = new StartupCoordinator();
    startup.setSplashWindow(splash);
    startup.setMainWindow(main);

    startup.showMainWindow();

    expect(main.show).toHaveBeenCalledOnce();
    expect(splash.close).toHaveBeenCalledOnce();
  });

  it('closes the splash safely when startup is interrupted before the main window is ready', () => {
    const splash = createWindowFake();
    const startup = new StartupCoordinator();
    startup.setSplashWindow(splash);

    expect(() => {
      startup.closeSplashWindow();
      startup.closeSplashWindow();
    }).not.toThrow();

    expect(splash.close).toHaveBeenCalledOnce();
  });

  it('safely handles missing splash and main windows', () => {
    const startup = new StartupCoordinator();

    expect(() => {
      startup.focusActiveWindow();
      startup.showMainWindow();
    }).not.toThrow();

    const splash = createWindowFake();
    startup.setSplashWindow(splash);
    expect(() => startup.showMainWindow()).not.toThrow();
    expect(splash.close).toHaveBeenCalledOnce();

    const main = createWindowFake();
    startup.setSplashWindow(null);
    startup.setMainWindow(main);
    expect(() => startup.showMainWindow()).not.toThrow();
    expect(main.show).toHaveBeenCalledOnce();
  });
});

describe('startup orchestration', () => {
  it('reports the original splash startup failure and skips remaining work', async () => {
    const splashFailure = new Error('splash navigation failed');
    const reports: unknown[] = [];
    const exit = vi.fn();
    const initializeIpc = vi.fn();
    const createMainWindow = vi.fn();
    const registerShortcuts = vi.fn();

    await runStartupSequence({
      createSplashWindow: async () => {
        throw splashFailure;
      },
      initializeIpc,
      createMainWindow,
      registerShortcuts,
      onFailure: createStartupFailureHandler({
        report: error => reports.push(error),
        exit,
      }),
    });

    expect(reports).toHaveLength(1);
    expect(reports[0]).toBe(splashFailure);
    expect(exit).toHaveBeenCalledOnce();
    expect(initializeIpc).not.toHaveBeenCalled();
    expect(createMainWindow).not.toHaveBeenCalled();
    expect(registerShortcuts).not.toHaveBeenCalled();
  });

  it('handles a splash navigation rejection through the startup sequence', async () => {
    const splashWindow = new SplashWindowEventSource();
    const splashFailure = new Error('splash navigation failed');
    const reports: unknown[] = [];
    const exit = vi.fn();
    const initializeIpc = vi.fn();
    const createMainWindow = vi.fn();
    const registerShortcuts = vi.fn();

    await runStartupSequence({
      createSplashWindow: () => {
        const { navigation, readyToShow } = navigateWithReadyToShowListener(splashWindow, () =>
          Promise.reject(splashFailure),
        );

        return Promise.all([navigation, readyToShow]).then(() => {});
      },
      initializeIpc,
      createMainWindow,
      registerShortcuts,
      onFailure: createStartupFailureHandler({
        report: error => reports.push(error),
        exit,
      }),
    });

    expect(reports).toHaveLength(1);
    expect(reports[0]).toBe(splashFailure);
    expect(exit).toHaveBeenCalledOnce();
    expect(initializeIpc).not.toHaveBeenCalled();
    expect(createMainWindow).not.toHaveBeenCalled();
    expect(registerShortcuts).not.toHaveBeenCalled();
  });

  it('reports the original IPC initialization failure and skips main startup work', async () => {
    const ipcFailure = new Error('IPC initialization failed');
    const reports: unknown[] = [];
    const exit = vi.fn();
    const createMainWindow = vi.fn();
    const registerShortcuts = vi.fn();

    await runStartupSequence({
      createSplashWindow: vi.fn(async () => {}),
      initializeIpc: async () => {
        throw ipcFailure;
      },
      createMainWindow,
      registerShortcuts,
      onFailure: createStartupFailureHandler({
        report: error => reports.push(error),
        exit,
      }),
    });

    expect(reports).toHaveLength(1);
    expect(reports[0]).toBe(ipcFailure);
    expect(exit).toHaveBeenCalledOnce();
    expect(createMainWindow).not.toHaveBeenCalled();
    expect(registerShortcuts).not.toHaveBeenCalled();
  });

  it('reports a main readiness failure once and exits', async () => {
    const mainWindow = new SplashWindowEventSource();
    const reports: unknown[] = [];
    const exit = vi.fn();
    const registerShortcuts = vi.fn();
    let signalMainStartup!: () => void;
    const mainStartupBegun = new Promise<void>(resolve => {
      signalMainStartup = resolve;
    });

    const startup = runStartupSequence({
      createSplashWindow: async () => {},
      initializeIpc: async () => {},
      createMainWindow: () => {
        const ready = waitForReadyToShow(mainWindow);
        signalMainStartup();
        return ready;
      },
      registerShortcuts,
      onFailure: createStartupFailureHandler({
        report: error => reports.push(error),
        exit,
      }),
    });

    await mainStartupBegun;
    mainWindow.emitClosed();
    await startup;

    expect(reports).toHaveLength(1);
    expect(reports[0]).toBeInstanceOf(Error);
    expect((reports[0] as Error).message).toBe('Window closed before it was ready to show');
    expect(exit).toHaveBeenCalledOnce();
    expect(registerShortcuts).not.toHaveBeenCalled();
  });

  it('handles a main navigation rejection through the startup sequence', async () => {
    const mainWindow = new SplashWindowEventSource();
    const mainFailure = new Error('main navigation failed');
    const reports: unknown[] = [];
    const exit = vi.fn();
    const registerShortcuts = vi.fn();

    await runStartupSequence({
      createSplashWindow: async () => {},
      initializeIpc: async () => {},
      createMainWindow: () => {
        const { navigation, readyToShow } = navigateWithReadyToShowListener(mainWindow, () =>
          Promise.reject(mainFailure),
        );
        mainWindow.emitReadyToShow();

        return Promise.all([navigation, readyToShow]).then(() => {});
      },
      registerShortcuts,
      onFailure: createStartupFailureHandler({
        report: error => reports.push(error),
        exit,
      }),
    });

    expect(reports).toHaveLength(1);
    expect(reports[0]).toBe(mainFailure);
    expect(exit).toHaveBeenCalledOnce();
    expect(registerShortcuts).not.toHaveBeenCalled();
  });

  it('does not report a successful startup or a normal post-startup main close', async () => {
    const mainWindow = new SplashWindowEventSource();
    const reports: unknown[] = [];
    const exit = vi.fn();
    const registerShortcuts = vi.fn();

    await runStartupSequence({
      createSplashWindow: async () => {},
      initializeIpc: async () => {},
      createMainWindow: () => {
        const ready = waitForReadyToShow(mainWindow);
        mainWindow.emitReadyToShow();
        return ready;
      },
      registerShortcuts,
      onFailure: createStartupFailureHandler({
        report: error => reports.push(error),
        exit,
      }),
    });
    mainWindow.emitClosed();

    expect(registerShortcuts).toHaveBeenCalledOnce();
    expect(reports).toEqual([]);
    expect(exit).not.toHaveBeenCalled();
  });
});
