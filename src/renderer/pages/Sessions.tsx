import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface SessionInfo {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  courtCount: number;
  status: string;
}

export function Sessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSession, setActiveSession] = useState<SessionInfo | null>(null);
  const [courtCount, setCourtCount] = useState(3);

  const load = async () => {
    const [all, active] = await Promise.all([
      window.api.sessionsList(),
      window.api.sessionsGetActive(),
    ]);
    setSessions(all as SessionInfo[]);
    setActiveSession((active as SessionInfo | undefined) ?? null);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (activeSession) {
      alert('已有活跃 Session，请先结束当前 Session');
      return;
    }
    await window.api.sessionsCreate(courtCount);
    load();
  };

  const handleEnd = async (id: string) => {
    if (confirm('确认结束该 Session？')) {
      await window.api.sessionsEnd(id);
      load();
    }
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Session 管理</h2>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">场地数:</label>
          <select
            value={courtCount}
            onChange={(e) => setCourtCount(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button
            onClick={handleCreate}
            disabled={!!activeSession}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            创建新 Session
          </button>
        </div>
      </div>

      {activeSession && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-green-800">当前活跃 Session</p>
              <p className="text-sm text-green-600 mt-1">
                {activeSession.date} · {activeSession.courtCount} 片场地 · 开始于 {activeSession.startTime ? new Date(activeSession.startTime).toLocaleTimeString('zh-CN') : '-'}
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                to={`/checkin/${activeSession.id}`}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                签到页
              </Link>
              <Link
                to={`/match/${activeSession.id}`}
                className="px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700"
              >
                对战面板
              </Link>
              <button
                onClick={() => handleEnd(activeSession.id)}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
              >
                结束 Session
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-500">日期</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">场地数</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">开始时间</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">结束时间</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">状态</th>
              <th className="text-right px-6 py-3 font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-6 py-3 font-medium">{s.date}</td>
                <td className="px-6 py-3">{s.courtCount}</td>
                <td className="px-6 py-3 text-gray-500">{s.startTime ? new Date(s.startTime).toLocaleTimeString('zh-CN') : '-'}</td>
                <td className="px-6 py-3 text-gray-500">{s.endTime ? new Date(s.endTime).toLocaleTimeString('zh-CN') : '-'}</td>
                <td className="px-6 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {s.status === 'active' ? '进行中' : '已结束'}
                  </span>
                </td>
                <td className="px-6 py-3 text-right">
                  {s.status === 'active' && (
                    <div className="flex justify-end gap-2">
                      <Link to={`/checkin/${s.id}`} className="text-blue-600 hover:underline text-xs">签到</Link>
                      <Link to={`/match/${s.id}`} className="text-orange-600 hover:underline text-xs">对战</Link>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">暂无 Session 记录</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
