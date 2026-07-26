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
  let finalized = false;
  const finalize = () => {
    if (finalized) return;
    finalized = true;
    unregisterShortcuts();
    closeDb();
  };

  return {
    handleWindowAllClosed() {
      if (platform !== 'darwin') quit();
    },

    handleWillQuit() {
      finalize();
    },

    handleSessionEnd() {
      finalize();
    },
  };
}
