import type { Game } from '../../../shared/types';

export interface GameInfo {
  id: string;
  sessionId: string;
  courtNumber: number;
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  status: 'pending' | 'playing' | 'completed';
  roundNumber: number;
  gameType: Game['gameType'];
  startedAt: string | null;
  endedAt: string | null;
  t1p1Name: string; t1p1Gender: string; t1p1Level: number;
  t1p2Name: string; t1p2Gender: string; t1p2Level: number;
  t2p1Name: string; t2p1Gender: string; t2p1Level: number;
  t2p2Name: string; t2p2Gender: string; t2p2Level: number;
}

export interface AttendanceInfo {
  id: string;
  playerId: string;
  sessionId: string;
  checkinTime: string;
  name: string;
  gender: string;
  level: number;
  paused: number;
}

export interface PlayerInfo {
  id: string;
  name: string;
  gender: string;
  level: number;
  phone: string;
}

export interface Settings {
  gameDuration: string;
  courtCount: string;
}

export interface ContextMenuTarget {
  attendanceId: string;
  playerId: string;
  name: string;
  gender: string;
  level: number;
  phone: string;
  paused: boolean;
  checkedOut: boolean;
}
