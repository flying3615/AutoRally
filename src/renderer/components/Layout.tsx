import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { MenuBar } from './MenuBar';

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
    if (!activeSession) return;
    navigate(`/checkin/${activeSession.id}`);
  };

  const handleMatchClick = () => {
    if (!activeSession) return;
    navigate(`/match/${activeSession.id}`);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top menu bar */}
      <MenuBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-52 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <div className="flex-1 py-3">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center px-5 py-2 text-[13px] transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}

            {activeSession && (
              <div className="mt-4 px-4">
                <p className="px-2 mb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">快捷操作</p>
                <button
                  onClick={handleCheckinClick}
                  className="w-full text-left px-3 py-1.5 rounded-md text-[13px] font-medium text-green-700 hover:bg-green-50 transition-colors"
                >
                  球员签到
                </button>
                <button
                  onClick={handleMatchClick}
                  className="w-full text-left px-3 py-1.5 rounded-md text-[13px] font-medium text-orange-700 hover:bg-orange-50 transition-colors"
                >
                  对战面板
                </button>
              </div>
            )}
          </div>

          {activeSession && (
            <div className="px-4 py-2 border-t border-gray-200 bg-green-50">
              <p className="text-[11px] text-green-700 font-medium">Session 进行中</p>
            </div>
          )}
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
