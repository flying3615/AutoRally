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
    to: '/tournaments',
    label: 'Tournaments',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0-6.736V.97A49.269 49.269 0 0112 0a49.269 49.269 0 01-2.769.084" />
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
  const { activeSession } = useSessionStore();
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const expanded = pinned || hovered;

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/';
    return location.pathname.startsWith(to);
  };

  const isSessionSubpage = location.pathname.startsWith('/checkin/') || location.pathname.startsWith('/match/') || location.pathname.startsWith('/report/');
  const isCheckinActive = location.pathname.startsWith('/checkin/');
  const isMatchActive = location.pathname.startsWith('/match/');
  const isReportActive = location.pathname.startsWith('/report/');

  return (
    <nav
      className="flex flex-col shrink-0 bg-white border-r border-zinc-200/60 overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
      style={{ width: expanded ? 192 : 52, WebkitAppRegion: 'drag' } as any}
      onMouseEnter={() => !pinned && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header */}
      <div className="flex items-center h-11 px-3.5 shrink-0 border-b border-zinc-100">
        <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.12)]">
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
          </svg>
        </div>
        <span className={`ml-2.5 text-[15px] font-semibold text-zinc-900 tracking-tight whitespace-nowrap transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
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
            <div key={item.to}>
              <Link
                to={item.to}
                className={`flex items-center h-9 mx-1.5 px-2 rounded-lg transition-all duration-150 ${
                  active
                    ? 'bg-zinc-800 text-white shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                    : 'text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600'
                }`}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className={`ml-2.5 text-sm font-medium whitespace-nowrap transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
                  {item.label}
                </span>
              </Link>

              {/* Sub-items under Sessions when active */}
              {item.to === '/sessions' && activeSession && (
                <div className={`mt-0.5 space-y-0.5 overflow-hidden transition-all duration-200 ${expanded ? 'max-h-28' : 'max-h-0'}`}>
                  <Link
                    to={`/checkin/${activeSession.id}`}
                    className={`flex items-center h-8 mx-1.5 pl-5 pr-2 rounded-lg text-[13px] transition-all duration-150 ${
                      isCheckinActive
                        ? 'bg-zinc-100 text-zinc-900 font-medium'
                        : 'text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600'
                    }`}
                  >
                    <svg className="w-[14px] h-[14px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className={`ml-1.5 whitespace-nowrap transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
                      Check-in
                    </span>
                  </Link>
                  <Link
                    to={`/match/${activeSession.id}`}
                    className={`flex items-center h-8 mx-1.5 pl-5 pr-2 rounded-lg text-[13px] transition-all duration-150 ${
                      isMatchActive
                        ? 'bg-zinc-100 text-zinc-900 font-medium'
                        : 'text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600'
                    }`}
                  >
                    <svg className="w-[14px] h-[14px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
                    </svg>
                    <span className={`ml-1.5 whitespace-nowrap transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
                      Match Panel
                    </span>
                  </Link>
                  <Link
                    to={`/report/${activeSession.id}`}
                    className={`flex items-center h-8 mx-1.5 pl-5 pr-2 rounded-lg text-[13px] transition-all duration-150 ${
                      isReportActive
                        ? 'bg-zinc-100 text-zinc-900 font-medium'
                        : 'text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600'
                    }`}
                  >
                    <svg className="w-[14px] h-[14px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                    <span className={`ml-1.5 whitespace-nowrap transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
                      Report
                    </span>
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pin toggle */}
      <div className="shrink-0 border-t border-zinc-100 py-1.5 px-2 flex justify-center" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button
          onClick={() => setPinned(p => !p)}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 ${
            pinned
              ? 'bg-zinc-800 text-white shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
              : 'text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600'
          }`}
          title={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${pinned ? '' : '-rotate-45'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </button>
      </div>
    </nav>
  );
}

function StatusBar() {
  const { activeSession, attendanceCount, playingCount, startPolling } = useSessionStore();
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    const stop = startPolling();
    return stop;
  }, [startPolling]);

  useEffect(() => {
    window.api.appVersion().then(setAppVersion).catch(() => setAppVersion(''));
  }, []);

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
              to={`/report/${activeSession!.id}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-zinc-200 hover:border-zinc-300 hover:text-zinc-600 active:scale-[0.97] font-sans font-medium transition-all"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
              Report
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
        {appVersion && (
          <>
            {showStats && <span className="text-zinc-200">·</span>}
            <span className="tabular-nums">v{appVersion}</span>
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
  const { upcomingSessions } = useSessionStore();
  const isSubpage = location.pathname.startsWith('/checkin/') || location.pathname.startsWith('/match/') || location.pathname.startsWith('/report/');

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const marqueeText = upcomingSessions.length > 0
    ? `Next: ${upcomingSessions.slice(0, 2).map(s => formatUpcoming(s)).join('  ·  |  ·  ')}`
    : '';

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
