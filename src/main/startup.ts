export interface AppWindow {
  isMinimized(): boolean;
  restore(): void;
  focus(): void;
  show(): void;
  close(): void;
}

export interface SplashWindowEventSource {
  once(event: 'ready-to-show', listener: () => void): unknown;
}

export function waitForSplashReadyToShow(splashWindow: SplashWindowEventSource): Promise<void> {
  return new Promise(resolve => splashWindow.once('ready-to-show', resolve));
}

export class StartupCoordinator {
  private splashWindow: AppWindow | null = null;
  private mainWindow: AppWindow | null = null;
  private pendingMainWindow: AppWindow | null = null;

  setSplashWindow(window: AppWindow | null) {
    this.splashWindow = window;
  }

  setMainWindow(window: AppWindow | null) {
    this.mainWindow = window;
  }

  setPendingMainWindow(window: AppWindow | null) {
    this.pendingMainWindow = window;
  }

  focusActiveWindow() {
    const window = this.mainWindow ?? this.splashWindow;
    if (!window) return;

    if (window.isMinimized()) window.restore();
    window.focus();
  }

  showMainWindow() {
    if (this.pendingMainWindow) {
      this.mainWindow = this.pendingMainWindow;
      this.pendingMainWindow = null;
    }
    this.mainWindow?.show();
    this.closeSplashWindow();
  }

  closeSplashWindow() {
    this.splashWindow?.close();
    this.splashWindow = null;
  }
}
