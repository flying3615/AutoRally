import { describe, expect, it, vi } from 'vitest';
import { StartupCoordinator } from '../main/startup';

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
  it('focuses the splash window while startup is in progress', () => {
    const splash = createWindowFake();
    const startup = new StartupCoordinator();
    startup.setSplashWindow(splash);

    startup.focusActiveWindow();

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
