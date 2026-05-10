import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

interface SessionInfo {
  id: string;
  status: string;
}

export function Layout() {
  const [activeSession, setActiveSession] = useState<SessionInfo | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    window.api.sessionsGetActive().then((s: SessionInfo | undefined) => {
      setActiveSession(s ?? null);
    });
  }, []);

  const navItems = [
    { to: '/', label: '仪表盘' },
    { to: '/players', label: '球员管理' },
    { to: '/sessions', label: 'Session' },
    { to: '/payments', label: '会费管理' },
    { to: '/history', label: '历史记录' },
    { to: '/settings', label: '设置' },
  ];

  const handleCheckinClick = () => {
    if (!activeSession) {
      alert('请先在 Session 页面创建一个新 Session');
      return;
    }
    navigate(`/checkin/${activeSession.id}`);
  };

  const handleMatchClick = () => {
    if (!activeSession) {
      alert('请先在 Session 页面创建一个新 Session');
      return;
    }
    navigate(`/match/${activeSession.id}`);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <nav className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-6 py-5 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">AutoRally</h1>
          <p className="text-xs text-gray-500 mt-0.5">羽毛球俱乐部管理</p>
        </div>
        <div className="flex-1 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block px-6 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}

          <div className="mt-6 px-4">
            <p className="px-2 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">快捷操作</p>
            <button
              onClick={handleCheckinClick}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeSession
                  ? 'bg-green-50 text-green-700 hover:bg-green-100'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              球员签到
            </button>
            <button
              onClick={handleMatchClick}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors mt-1 ${
                activeSession
                  ? 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              对战面板
            </button>
          </div>
        </div>

        {activeSession && (
          <div className="px-4 py-3 border-t border-gray-200 bg-green-50">
            <p className="text-xs text-green-700 font-medium">Session 进行中</p>
          </div>
        )}
      </nav>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
