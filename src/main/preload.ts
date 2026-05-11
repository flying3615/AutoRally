import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Settings
  settingsGetAll: () => ipcRenderer.invoke('settings:getAll'),
  settingsSet: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),

  // Players
  playersList: () => ipcRenderer.invoke('players:list'),
  playersCreate: (player: { name: string; gender: string; level: number; phone: string }) =>
    ipcRenderer.invoke('players:create', player),
  playersUpdate: (id: string, data: { name?: string; gender?: string; level?: number; phone?: string }) =>
    ipcRenderer.invoke('players:update', id, data),
  playersDelete: (id: string) => ipcRenderer.invoke('players:delete', id),

  // Sessions
  sessionsList: () => ipcRenderer.invoke('sessions:list'),
  sessionsGetActive: () => ipcRenderer.invoke('sessions:getActive'),
  sessionsCreate: (courtCount: number) => ipcRenderer.invoke('sessions:create', courtCount),
  sessionsEnd: (id: string) => ipcRenderer.invoke('sessions:end', id),

  // Attendance
  attendanceCheckin: (playerId: string, sessionId: string) =>
    ipcRenderer.invoke('attendance:checkin', playerId, sessionId),
  attendanceListBySession: (sessionId: string) =>
    ipcRenderer.invoke('attendance:listBySession', sessionId),
  attendanceSetPaused: (id: string, paused: boolean) =>
    ipcRenderer.invoke('attendance:setPaused', id, paused),
  attendanceRemove: (id: string) => ipcRenderer.invoke('attendance:remove', id),

  // Games
  gamesListBySession: (sessionId: string) => ipcRenderer.invoke('games:listBySession', sessionId),
  gamesCreate: (game: {
    sessionId: string; courtNumber: number;
    team1Player1Id: string; team1Player2Id: string;
    team2Player1Id: string; team2Player2Id: string;
    roundNumber: number; gameType: string;
  }) => ipcRenderer.invoke('games:create', game),
  gamesStart: (id: string) => ipcRenderer.invoke('games:start', id),
  gamesComplete: (id: string) => ipcRenderer.invoke('games:complete', id),
  gamesDelete: (id: string) => ipcRenderer.invoke('games:delete', id),
  gamesDeleteAllPending: (sessionId: string) => ipcRenderer.invoke('games:deleteAllPending', sessionId),
  gamesMaxRound: (sessionId: string) => ipcRenderer.invoke('games:maxRound', sessionId),
  gamesReplacePlayer: (gameId: string, slot: string, newPlayerId: string) =>
    ipcRenderer.invoke('games:replacePlayer', gameId, slot, newPlayerId),

  // Payments
  paymentsListBySession: (sessionId: string) =>
    ipcRenderer.invoke('payments:listBySession', sessionId),
  paymentsListUnpaid: () => ipcRenderer.invoke('payments:listUnpaid'),
  paymentsMarkPaid: (id: string) => ipcRenderer.invoke('payments:markPaid', id),
  paymentsTopup: (playerId: string, amount: number) =>
    ipcRenderer.invoke('payments:topup', playerId, amount),

  // Balances
  balancesGet: (playerId: string) => ipcRenderer.invoke('balances:get', playerId),
  balancesListLow: (threshold: number) => ipcRenderer.invoke('balances:listLow', threshold),

  // History
  historyPlayerStats: (playerId: string) =>
    ipcRenderer.invoke('history:playerStats', playerId),

  // Window
  windowIsFullscreen: () => ipcRenderer.invoke('window:isFullscreen'),
  windowSetFullscreen: (flag: boolean) => ipcRenderer.invoke('window:setFullscreen', flag),
  webFrameZoomIn: () => ipcRenderer.invoke('webFrame:zoomIn'),
  webFrameZoomOut: () => ipcRenderer.invoke('webFrame:zoomOut'),
  webFrameZoomReset: () => ipcRenderer.invoke('webFrame:zoomReset'),
  appQuit: () => ipcRenderer.invoke('app:quit'),
  exportCSV: () => ipcRenderer.invoke('export:csv'),
};

export type ElectronAPI = typeof api;

contextBridge.exposeInMainWorld('api', api);

// Expose shortcut listeners
contextBridge.exposeInMainWorld('shortcuts', {
  onNewSession: (cb: () => void) => ipcRenderer.on('shortcut:new-session', cb),
  onEndSession: (cb: () => void) => ipcRenderer.on('shortcut:end-session', cb),
  onExport: (cb: () => void) => ipcRenderer.on('shortcut:export', cb),
  onAddPlayer: (cb: () => void) => ipcRenderer.on('shortcut:add-player', cb),
  onSearchPlayer: (cb: () => void) => ipcRenderer.on('shortcut:search-player', cb),
  onSettings: (cb: () => void) => ipcRenderer.on('shortcut:settings', cb),
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
});
