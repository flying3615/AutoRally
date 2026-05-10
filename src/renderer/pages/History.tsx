import { useEffect, useState } from 'react';

interface PlayerInfo {
  id: string;
  name: string;
  gender: string;
  level: number;
  balance: number;
}

interface SessionInfo {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  courtCount: number;
  status: string;
}

export function History() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [stats, setStats] = useState<{ sessionCount: number; gameCount: number } | null>(null);

  useEffect(() => {
    window.api.sessionsList().then(s => setSessions(s as SessionInfo[]));
    window.api.playersList().then(p => setPlayers(p as PlayerInfo[]));
  }, []);

  useEffect(() => {
    if (selectedPlayer) {
      window.api.historyPlayerStats(selectedPlayer).then(s => setStats(s as { sessionCount: number; gameCount: number }));
    } else {
      setStats(null);
    }
  }, [selectedPlayer]);

  const completedSessions = sessions.filter(s => s.status === 'completed');

  return (
    <div className="p-8 max-w-5xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">历史记录</h2>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">球员统计</h3>
          <select
            value={selectedPlayer ?? ''}
            onChange={(e) => setSelectedPlayer(e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">选择球员...</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {stats && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">参加 Session</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.sessionCount}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">完成比赛</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.gameCount}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">历史 Session</h3>
          <div className="space-y-2">
            {completedSessions.map(s => (
              <div key={s.id} className="bg-white rounded-lg border border-gray-100 px-5 py-3 text-sm">
                <span className="font-medium">{s.date}</span>
                <span className="text-gray-400 ml-3">{s.courtCount} 片场地</span>
                <span className="text-gray-400 ml-3">
                  {s.startTime ? new Date(s.startTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                  {' - '}
                  {s.endTime ? new Date(s.endTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                </span>
              </div>
            ))}
            {completedSessions.length === 0 && (
              <p className="text-gray-400 text-sm">暂无历史记录</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
