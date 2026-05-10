import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface SessionInfo {
  id: string;
  date: string;
  status: string;
  courtCount: number;
}

interface UnpaidPayment {
  id: string;
  playerName: string;
  amount: number;
}

export function Dashboard() {
  const [activeSession, setActiveSession] = useState<SessionInfo | null>(null);
  const [unpaidCount, setUnpaidCount] = useState(0);

  useEffect(() => {
    window.api.sessionsGetActive().then((s: SessionInfo | undefined) => setActiveSession(s ?? null));
    window.api.paymentsListUnpaid().then((p: UnpaidPayment[]) => setUnpaidCount(p.length));
  }, []);

  return (
    <div className="p-8 max-w-5xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">仪表盘</h2>

      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">当前 Session</p>
          {activeSession ? (
            <>
              <p className="text-lg font-semibold text-green-600">进行中</p>
              <p className="text-xs text-gray-400 mt-1">{activeSession.date} · {activeSession.courtCount} 片场地</p>
              <Link to={`/match/${activeSession.id}`} className="mt-3 inline-block text-sm text-blue-600 hover:underline">
                进入对战面板 →
              </Link>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-gray-400">无活跃 Session</p>
              <Link to="/sessions" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
                创建新 Session →
              </Link>
            </>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">未缴费</p>
          <p className="text-lg font-semibold text-gray-900">{unpaidCount} 笔</p>
          <Link to="/payments" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
            查看详情 →
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">快速操作</p>
          <div className="flex flex-col gap-2 mt-2">
            <Link to="/players" className="text-sm text-blue-600 hover:underline">管理球员</Link>
            <Link to="/history" className="text-sm text-blue-600 hover:underline">历史记录</Link>
            <Link to="/settings" className="text-sm text-blue-600 hover:underline">系统设置</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
