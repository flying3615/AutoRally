import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

interface PlayerInfo {
  id: string;
  name: string;
  gender: string;
  level: number;
  balance: number;
}

interface AttendanceInfo {
  id: string;
  playerId: string;
  sessionId: string;
  checkinTime: string;
  name: string;
  gender: string;
  level: number;
}

export function Checkin() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [attendance, setAttendance] = useState<AttendanceInfo[]>([]);
  const [search, setSearch] = useState('');
  const [lastCheckin, setLastCheckin] = useState<string | null>(null);

  const load = async () => {
    if (!sessionId) return;
    const [allPlayers, attendList] = await Promise.all([
      window.api.playersList(),
      window.api.attendanceListBySession(sessionId),
    ]);
    setPlayers(allPlayers as PlayerInfo[]);
    setAttendance(attendList as AttendanceInfo[]);
  };

  useEffect(() => { load(); }, [sessionId]);

  const attendedIds = new Set(attendance.map(a => a.playerId));
  const filtered = players.filter(p =>
    !attendedIds.has(p.id) &&
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCheckin = async (playerId: string, playerName: string) => {
    if (!sessionId) return;
    await window.api.attendanceCheckin(playerId, sessionId);
    setLastCheckin(playerName);
    setTimeout(() => setLastCheckin(null), 2000);
    load();
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900">签到</h2>
        <p className="text-gray-500 mt-2">点击姓名签到参加本次 Session</p>
      </div>

      {lastCheckin && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-center">
          <p className="text-green-800 font-semibold text-lg">{lastCheckin} 签到成功!</p>
        </div>
      )}

      <div className="mb-6">
        <input
          type="text" value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索球员姓名..."
          className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        {filtered.map(p => (
          <button
            key={p.id}
            onClick={() => handleCheckin(p.id, p.name)}
            className="bg-white border-2 border-gray-200 rounded-xl p-4 text-left hover:border-blue-400 hover:bg-blue-50 transition-all active:scale-95"
          >
            <p className="text-lg font-semibold text-gray-900">{p.name}</p>
            <p className="text-sm text-gray-500">{p.gender === 'male' ? '男' : '女'} · 水平 {p.level} · 余额 ¥{p.balance.toFixed(0)}</p>
          </button>
        ))}
        {filtered.length === 0 && search && (
          <p className="col-span-2 text-center text-gray-400 py-4">未找到匹配的球员</p>
        )}
      </div>

      <div className="bg-gray-50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">已签到 ({attendance.length} 人)</h3>
        <div className="flex flex-wrap gap-2">
          {attendance.map(a => (
            <span key={a.id} className="px-3 py-1.5 bg-green-100 text-green-800 rounded-lg text-sm font-medium">
              {a.name}
            </span>
          ))}
          {attendance.length === 0 && <p className="text-gray-400 text-sm">暂无签到</p>}
        </div>
      </div>
    </div>
  );
}
