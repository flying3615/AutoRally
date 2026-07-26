export interface AppWindow {
  isMinimized(): boolean;
  restore(): void;
  focus(): void;
  show(): void;
  close(): void;
}

export interface ReadyToShowEventSource {
  once(event: 'ready-to-show' | 'closed', listener: () => void): unknown;
}

export function waitForReadyToShow(window: ReadyToShowEventSource): Promise<void> {
  return new Promise((resolve, reject) => {
    window.once('ready-to-show', resolve);
    window.once('closed', () => reject(new Error('Window closed before it was ready to show')));
  });
}

export function navigateWithReadyToShowListener<T>(
  window: ReadyToShowEventSource,
  navigate: () => T,
): { navigation: T; readyToShow: Promise<void> } {
  const readyToShow = waitForReadyToShow(window);

  return { navigation: navigate(), readyToShow };
}

export class StartupCoordinator {
  private splashWindow: AppWindow | null = null;
  private splashVisible = false;
  private mainWindow: AppWindow | null = null;
  private pendingMainWindow: AppWindow | null = null;
  private pendingFocus = false;

  setSplashWindow(window: AppWindow | null) {
    this.splashWindow = window;
    this.splashVisible = false;
  }

  setMainWindow(window: AppWindow | null) {
    this.mainWindow = window;
  }

  setPendingMainWindow(window: AppWindow | null) {
    this.pendingMainWindow = window;
  }

  focusActiveWindow() {
    const window = this.mainWindow ?? (this.splashVisible ? this.splashWindow : null);
    if (!window) {
      this.pendingFocus = true;
      return;
    }

    this.focusWindow(window);
  }

  showSplashWindow() {
    if (!this.splashWindow) return;

    this.splashWindow.show();
    this.splashVisible = true;
    this.focusPendingWindow(this.splashWindow);
  }

  showMainWindow() {
    if (this.pendingMainWindow) {
      this.mainWindow = this.pendingMainWindow;
      this.pendingMainWindow = null;
    }
    this.mainWindow?.show();
    this.focusPendingWindow(this.mainWindow);
    this.closeSplashWindow();
  }

  closeSplashWindow() {
    this.splashWindow?.close();
    this.splashWindow = null;
    this.splashVisible = false;
  }

  private focusPendingWindow(window: AppWindow | null) {
    if (!this.pendingFocus || !window) return;

    this.pendingFocus = false;
    this.focusWindow(window);
  }

  private focusWindow(window: AppWindow) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
}
