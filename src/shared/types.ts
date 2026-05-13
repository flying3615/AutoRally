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
  gameType: 'mixed' | 'male-double' | 'female-double' | 'open-double';
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
  sessionFee: 10,
  gameDuration: 15,
};

// ── Tournament ──

export interface Tournament {
  id: string;
  name: string;
  description: string;
  date: string;
  format: 'knockout' | 'round_robin' | 'mixed';
  status: 'upcoming' | 'active' | 'completed';
  courtCount: number;
  createdAt: string;
}

export interface TournamentRegistration {
  id: string;
  tournamentId: string;
  player1Id: string;
  player2Id: string | null;
  registeredAt: string;
}

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  round: string;
  matchNumber: number;
  courtNumber: number | null;
  status: 'pending' | 'in_progress' | 'completed';
  team1Player1Id: string;
  team1Player2Id: string | null;
  team2Player1Id: string;
  team2Player2Id: string | null;
  team1Score: number | null;
  team2Score: number | null;
  winner: 'team1' | 'team2' | null;
  scheduledTime: string | null;
  completedAt: string | null;
}

export interface TournamentStanding {
  id: string;
  tournamentId: string;
  player1Id: string;
  player2Id: string | null;
  matchesPlayed: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
}
