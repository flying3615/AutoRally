export interface AppLifecycleDependencies {
  platform: string;
  quit: () => void;
  unregisterShortcuts: () => void;
  closeDb: () => void;
}

export function createAppLifecycle({
  platform,
  quit,
  unregisterShortcuts,
  closeDb,
}: AppLifecycleDependencies) {
  return {
    handleWindowAllClosed() {
      if (platform !== 'darwin') quit();
    },

    handleWillQuit() {
      unregisterShortcuts();
      closeDb();
    },
  };
}
