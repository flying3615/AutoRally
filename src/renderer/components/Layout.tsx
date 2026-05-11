import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { GameProvider } from '../contexts/GameContext';
import { useSessionStore } from '../stores/sessionStore';

const navItems = [
  {
    to: '/',
    label: 'Dashboard',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    to: '/players',
    label: 'Players',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    to: '/sessions',
    label: 'Sessions',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    to: '/payments',
    label: 'Payments',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

function Sidebar() {
  const location = useLocation();

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/';
    return location.pathname.startsWith(to);
  };

  const isSessionSubpage = location.pathname.startsWith('/checkin/') || location.pathname.startsWith('/match/');

  return (
    <nav className="group flex flex-col shrink-0 bg-white border-r border-zinc-200/60 overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] w-[52px] hover:w-[192px]"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* Header */}
      <div className="flex items-center h-11 px-3.5 shrink-0 border-b border-zinc-100">
        <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.12)]">
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
          </svg>
        </div>
        <span className="ml-2.5 text-[15px] font-semibold text-zinc-900 tracking-tight whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          AutoRally
        </span>
      </div>

      {/* Nav items */}
      <div className="flex-1 py-2 space-y-0.5" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {navItems.map(item => {
          const active = item.to === '/sessions'
            ? isActive('/sessions') || isSessionSubpage
            : isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center h-9 mx-1.5 px-2 rounded-lg transition-all duration-150 ${
                active
                  ? 'bg-zinc-800 text-white shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                  : 'text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600'
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="ml-2.5 text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function StatusBar() {
  const { activeSession, attendanceCount, playingCount, startPolling } = useSessionStore();

  useEffect(() => {
    const stop = startPolling();
    return stop;
  }, [startPolling]);

  const showStats = activeSession !== null;

  // Format DB date string (YYYY-MM-DD) to readable format
  const formatSessionDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex items-center justify-between h-8 px-4 bg-white/80 backdrop-blur-sm border-t border-zinc-200/60 text-xs text-zinc-400 select-none shrink-0 font-mono">
      <div className="flex items-center gap-3">
        {activeSession ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-emerald-600 font-sans font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Session active
            </span>
            <span className="text-zinc-200">·</span>
            <span className="tabular-nums">{formatSessionDate(activeSession.date)}</span>
            <span className="text-zinc-200">·</span>
            <span>{activeSession.courtCount} courts</span>
          </>
        ) : (
          <span className="font-sans font-medium">AutoRally</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {showStats && (
          <>
            <span className="tabular-nums">{attendanceCount} checked in</span>
            <span className="text-zinc-200">·</span>
            <span className="tabular-nums">{playingCount} playing</span>
            <span className="text-zinc-200">·</span>
            <Link
              to={`/checkin/${activeSession!.id}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-zinc-200 hover:border-zinc-300 hover:text-zinc-600 active:scale-[0.97] font-sans font-medium transition-all"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6.75h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 18V7.875c0-.621.504-1.125 1.125-1.125H9m3 0V4.5m0 3.75v10.5M12 8.25l3-3m0 0l3 3m-6 0l-3-3" />
              </svg>
              Check-in
            </Link>
            <Link
              to={`/match/${activeSession!.id}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 active:scale-[0.97] font-sans font-medium transition-all"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
              </svg>
              Match Panel
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

interface UpcomingSession {
  id: string;
  date: string;
  time: string;
  note: string;
}

function formatUpcoming(s: UpcomingSession): string {
  const d = new Date(s.date + 'T00:00:00');
  const datePart = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timePart = s.time
    ? new Date('2000-01-01T' + s.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '';
  let text = `${datePart}`;
  if (timePart) text += ` at ${timePart}`;
  if (s.note) text += ` — ${s.note}`;
  return text;
}

function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [marqueeText, setMarqueeText] = useState('');
  const isSubpage = location.pathname.startsWith('/checkin/') || location.pathname.startsWith('/match/');

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const list = await window.api.upcomingSessionsList();
        if (list.length === 0) {
          setMarqueeText('');
          return;
        }
        const recent = list.slice(0, 2);
        const parts = recent.map(s => formatUpcoming(s));
        setMarqueeText(`Next: ${parts.join('  ·  |  ·  ')}`);
      } catch {
        setMarqueeText('');
      }
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="flex items-center justify-between h-10 px-4 border-b border-zinc-200/60 bg-white/80 backdrop-blur-sm shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div className="flex items-center gap-3 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {isSubpage && (
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-400 hover:text-zinc-700 transition-colors active:scale-[0.97]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back
          </button>
        )}
      </div>

      {/* Scrolling upcoming-sessions text */}
      <div className="flex-1 mx-4 overflow-hidden">
        {marqueeText && (
          <span className="marquee-text text-[13px] font-medium text-red-600">{marqueeText}</span>
        )}
      </div>

      <div className="flex items-center gap-2 text-[13px] text-zinc-700 font-semibold tabular-nums shrink-0">
        <span className="font-sans">{dateStr}</span>
        <span className="text-zinc-300">·</span>
        <span className="font-mono">{timeStr}</span>
      </div>
    </div>
  );
}

export function Layout() {
  return (
    <GameProvider>
      <div className="flex h-screen bg-[#F7F7F8]">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-hidden relative">
            <Outlet />
          </main>
          <StatusBar />
        </div>
      </div>
    </GameProvider>
  );
}
