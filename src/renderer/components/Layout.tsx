import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: '仪表盘' },
  { to: '/players', label: '球员管理' },
  { to: '/sessions', label: 'Session' },
  { to: '/payments', label: '会费管理' },
  { to: '/history', label: '历史记录' },
  { to: '/settings', label: '设置' },
];

export function Layout() {
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
        </div>
      </nav>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
