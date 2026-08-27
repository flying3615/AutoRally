import { contextBridge, ipcRenderer } from 'electron';
import type { SetScore } from '../shared/badminton';

const api = {
  // Settings
  settingsGetAll: () => ipcRenderer.invoke('settings:getAll'),
  settingsSet: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  appVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,
  dataExportBackup: () =>
    ipcRenderer.invoke('data:exportBackup') as Promise<{ canceled: true } | { canceled: false; filePath: string }>,
  dataImportBackup: () =>
    ipcRenderer.invoke('data:importBackup') as Promise<{ canceled: true } | { canceled: false; filePath: string }>,
  dataClearHistory: () =>
    ipcRenderer.invoke('data:clearHistory') as Promise<{
      payments: number;
      sessions: number;
      tournaments: number;
    }>,

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
  attendanceCheckin: (playerId: string, sessionId: string, paymentMethod: string) =>
    ipcRenderer.invoke('attendance:checkin', playerId, sessionId, paymentMethod),
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
  gamesPause: (id: string) => ipcRenderer.invoke('games:pause', id),
  gamesResume: (id: string) => ipcRenderer.invoke('games:resume', id),
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

  // Upcoming Sessions
  upcomingSessionsList: () => ipcRenderer.invoke('upcomingSessions:list') as Promise<{ id: string; date: string; time: string; note: string }[]>,
  upcomingSessionsCreate: (data: { date: string; time: string; note: string }) =>
    ipcRenderer.invoke('upcomingSessions:create', data),
  upcomingSessionsUpdate: (id: string, data: { date: string; time: string; note: string }) =>
    ipcRenderer.invoke('upcomingSessions:update', id, data),
  upcomingSessionsDelete: (id: string) => ipcRenderer.invoke('upcomingSessions:delete', id),

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
  dashboardStats: () => ipcRenderer.invoke('dashboard:stats'),
  playersImportCsv: () => ipcRenderer.invoke('players:importCsv') as Promise<{ imported: number; skipped: number; errors: string[] }>,
  reportSessionStats: (sessionId: string) => ipcRenderer.invoke('report:sessionStats', sessionId) as Promise<{
    maxRound: number;
    players: { playerId: string; name: string; gender: string; level: number; played: number; satOut: number; doubles: number; mixed: number; totalRounds: number }[];
  }>,
  tournamentsList: () => ipcRenderer.invoke('tournaments:list'),
  tournamentsGet: (id: string) => ipcRenderer.invoke('tournaments:get', id),
  tournamentsCreate: (data: { name: string; description?: string; date: string; format: string; courtCount?: number }) => ipcRenderer.invoke('tournaments:create', data),
  tournamentsUpdate: (id: string, data: { name?: string; description?: string; date?: string; format?: string; courtCount?: number }) => ipcRenderer.invoke('tournaments:update', id, data),
  tournamentsDelete: (id: string) => ipcRenderer.invoke('tournaments:delete', id),
  tournamentsRegister: (tournamentId: string, player1Id: string, player2Id?: string) => ipcRenderer.invoke('tournaments:register', tournamentId, player1Id, player2Id),
  tournamentsUnregister: (id: string) => ipcRenderer.invoke('tournaments:unregister', id),
  tournamentsRegistrations: (tournamentId: string) => ipcRenderer.invoke('tournaments:registrations', tournamentId),
  tournamentsGenerateBracket: (tournamentId: string) => ipcRenderer.invoke('tournaments:generateBracket', tournamentId),
  tournamentsSetScore: (matchId: string, sets: SetScore[]) => ipcRenderer.invoke('tournaments:setScore', matchId, sets),
  tournamentsAdvanceWinners: (tournamentId: string, currentRound: string) => ipcRenderer.invoke('tournaments:advanceWinners', tournamentId, currentRound),
  tournamentsReassignMatch: (matchId: string, assignment: { team1RegistrationId: string; team2RegistrationId: string }) => ipcRenderer.invoke('tournaments:reassignMatch', matchId, assignment),
  tournamentsStandings: (tournamentId: string) => ipcRenderer.invoke('tournaments:standings', tournamentId),
  // Team tournament
  tournamentTeamsList: (tournamentId: string) => ipcRenderer.invoke('tournament:teams:list', tournamentId),
  tournamentTeamsCreate: (tournamentId: string, name: string, color?: string) => ipcRenderer.invoke('tournament:teams:create', tournamentId, name, color),
  tournamentTeamsDelete: (teamId: string) => ipcRenderer.invoke('tournament:teams:delete', teamId),
  tournamentTeamsAddPlayer: (teamId: string, playerId: string) => ipcRenderer.invoke('tournament:teams:addPlayer', teamId, playerId),
  tournamentTeamsRemovePlayer: (teamId: string, playerId: string) => ipcRenderer.invoke('tournament:teams:removePlayer', teamId, playerId),
  tournamentTeamsListPlayers: (teamId: string) => ipcRenderer.invoke('tournament:teams:listPlayers', teamId),
  tournamentTeamMatchesGenerate: (tournamentId: string, composition: { ms: number; ws: number; md: number; xd: number; wd: number }) => ipcRenderer.invoke('tournament:teamMatches:generate', tournamentId, composition),
  tournamentTeamMatchesList: (tournamentId: string) => ipcRenderer.invoke('tournament:teamMatches:list', tournamentId),
  tournamentTeamMatchesListGames: (teamMatchId: string) => ipcRenderer.invoke('tournament:teamMatches:listGames', teamMatchId),
  tournamentTeamMatchesAssignCourt: (gameId: string, courtNumber: number) => ipcRenderer.invoke('tournament:teamMatches:assignCourt', gameId, courtNumber),
  tournamentTeamMatchesSetScore: (gameId: string, sets: SetScore[]) => ipcRenderer.invoke('tournament:teamMatches:setScore', gameId, sets),
  tournamentTeamMatchesReassignPlayers: (gameId: string, assignment: { team1Player1Id: string; team1Player2Id: string | null; team2Player1Id: string; team2Player2Id: string | null }) => ipcRenderer.invoke('tournament:teamMatches:reassignPlayers', gameId, assignment),
  tournamentTeamsStandings: (tournamentId: string) => ipcRenderer.invoke('tournament:teams:standings', tournamentId),
};

export type ElectronAPI = typeof api;

contextBridge.exposeInMainWorld('api', api);

// Expose shortcut listeners
contextBridge.exposeInMainWorld('shortcuts', {
  onNewSession: (cb: () => void) => ipcRenderer.on('shortcut:new-session', (_e) => cb()),
  onEndSession: (cb: () => void) => ipcRenderer.on('shortcut:end-session', (_e) => cb()),
  onExport: (cb: () => void) => ipcRenderer.on('shortcut:export', (_e) => cb()),
  onAddPlayer: (cb: () => void) => ipcRenderer.on('shortcut:add-player', (_e) => cb()),
  onSearchPlayer: (cb: () => void) => ipcRenderer.on('shortcut:search-player', (_e) => cb()),
  onSettings: (cb: () => void) => ipcRenderer.on('shortcut:settings', (_e) => cb()),
  removeAllListeners: (channel: string) => {
    const ALLOWED = new Set([
      'shortcut:new-session', 'shortcut:end-session', 'shortcut:export',
      'shortcut:add-player', 'shortcut:search-player', 'shortcut:settings',
    ]);
    if (ALLOWED.has(channel)) ipcRenderer.removeAllListeners(channel);
  },
});
