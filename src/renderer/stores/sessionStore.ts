import { create } from 'zustand';

interface ActiveSession {
  id: string;
  date: string;
  startTime: string;
  courtCount: number;
}

interface SessionState {
  activeSession: ActiveSession | null;
  attendanceCount: number;
  playingCount: number;
  lastRefresh: number;
  refresh: () => Promise<void>;
  startPolling: () => () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSession: null,
  attendanceCount: 0,
  playingCount: 0,
  lastRefresh: 0,

  refresh: async () => {
    try {
      const s = await window.api.sessionsGetActive() as ActiveSession | undefined;
      if (s) {
        const [att, games] = await Promise.all([
          window.api.attendanceListBySession(s.id) as Promise<any[]>,
          window.api.gamesListBySession(s.id) as Promise<any[]>,
        ]);
        const playingGames = games.filter((g: any) => g.status === 'playing');
        const playingIds = new Set<string>();
        playingGames.forEach((g: any) => {
          playingIds.add(g.team1Player1Id);
          playingIds.add(g.team1Player2Id);
          playingIds.add(g.team2Player1Id);
          playingIds.add(g.team2Player2Id);
        });
        set({ activeSession: s, attendanceCount: att.length, playingCount: playingIds.size, lastRefresh: Date.now() });
      } else {
        set({ activeSession: null, attendanceCount: 0, playingCount: 0, lastRefresh: Date.now() });
      }
    } catch {
      // Silently ignore — will retry on next poll
    }
  },

  startPolling: () => {
    get().refresh();
    const id = setInterval(() => get().refresh(), 3000);
    return () => clearInterval(id);
  },
}));
