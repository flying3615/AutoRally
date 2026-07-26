export interface AppWindow {
  isMinimized(): boolean;
  restore(): void;
  focus(): void;
  show(): void;
  close(): void;
}

export class StartupCoordinator {
  private splashWindow: AppWindow | null = null;
  private mainWindow: AppWindow | null = null;

  setSplashWindow(window: AppWindow | null) {
    this.splashWindow = window;
  }

  setMainWindow(window: AppWindow | null) {
    this.mainWindow = window;
  }

  focusActiveWindow() {
    const window = this.mainWindow ?? this.splashWindow;
    if (!window) return;

    if (window.isMinimized()) window.restore();
    window.focus();
  }

  showMainWindow() {
    this.mainWindow?.show();
    this.closeSplashWindow();
  }

  closeSplashWindow() {
    this.splashWindow?.close();
    this.splashWindow = null;
  }
}
