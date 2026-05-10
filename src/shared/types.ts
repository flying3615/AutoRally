export interface Player {
  id: string;
  name: string;
  gender: 'male' | 'female';
  level: 1 | 2 | 3 | 4 | 5;
  phone: string;
  joinDate: string;
}

export interface Session {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  courtCount: number;
  status: 'active' | 'completed';
}

export interface Attendance {
  id: string;
  playerId: string;
  sessionId: string;
  checkinTime: string;
}

export interface Game {
  id: string;
  sessionId: string;
  courtNumber: number;
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  status: 'pending' | 'playing' | 'completed';
  roundNumber: number;
  gameType: 'same-gender' | 'mixed';
  startedAt: string | null;
  endedAt: string | null;
}

export interface Balance {
  id: string;
  playerId: string;
  balance: number;
  lastUpdated: string;
}

export interface Payment {
  id: string;
  playerId: string;
  sessionId: string | null;
  amount: number;
  status: 'paid' | 'unpaid';
  paidDate: string | null;
  paymentType: 'session' | 'topup';
}

export interface Settings {
  courtCount: number;
  sessionFee: number;
  gameDuration: number;
}

export const DEFAULT_SETTINGS: Settings = {
  courtCount: 3,
  sessionFee: 30,
  gameDuration: 15,
};
