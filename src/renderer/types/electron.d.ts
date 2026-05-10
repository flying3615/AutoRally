import type { ElectronAPI } from '../../main/preload';

declare global {
  interface Window {
    api: ElectronAPI;
    shortcuts: {
      onNewSession: (cb: () => void) => void;
      onEndSession: (cb: () => void) => void;
      onExport: (cb: () => void) => void;
      onAddPlayer: (cb: () => void) => void;
      onSearchPlayer: (cb: () => void) => void;
      onSettings: (cb: () => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}
