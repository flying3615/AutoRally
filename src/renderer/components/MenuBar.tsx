import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface SessionInfo {
  id: string;
  status: string;
  courtCount: number;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

interface Menu {
  label: string;
  items: MenuItem[];
}

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [activeSession, setActiveSession] = useState<SessionInfo | null>(null);
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.api.sessionsGetActive().then((s: SessionInfo | undefined) => {
      setActiveSession(s ?? null);
    });
  }, []);

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleNewSession = useCallback(async () => {
    if (activeSession) {
      alert('已有活跃 Session，请先结束当前 Session');
      return;
    }
    const s = await window.api.sessionsCreate(3) as SessionInfo;
    setActiveSession(s);
    navigate('/sessions');
    setOpenMenu(null);
  }, [activeSession, navigate]);

  const handleEndSession = useCallback(async () => {
    if (!activeSession) return;
    if (!confirm('确认结束当前 Session？')) return;
    await window.api.sessionsEnd(activeSession.id);
    setActiveSession(null);
    navigate('/sessions');
    setOpenMenu(null);
  }, [activeSession, navigate]);

  const handleExport = useCallback(async () => {
    await window.api.exportCSV();
    setOpenMenu(null);
  }, []);

  const handleQuit = useCallback(() => {
    window.api.appQuit();
  }, []);

  const handleAddPlayer = useCallback(() => {
    navigate('/players');
    // Dispatch custom event for Players page to open form
    window.dispatchEvent(new CustomEvent('menu:add-player'));
    setOpenMenu(null);
  }, [navigate]);

  const handleSearchPlayer = useCallback(() => {
    navigate('/players');
    window.dispatchEvent(new CustomEvent('menu:search-player'));
    setOpenMenu(null);
  }, [navigate]);

  const handleFullscreen = useCallback(async () => {
    const isFull = await window.api.windowIsFullscreen();
    window.api.windowSetFullscreen(!isFull);
    setOpenMenu(null);
  }, []);

  const handleZoomIn = useCallback(() => {
    window.api.webFrameZoomIn();
    setOpenMenu(null);
  }, []);

  const handleZoomOut = useCallback(() => {
    window.api.webFrameZoomOut();
    setOpenMenu(null);
  }, []);

  const handleZoomReset = useCallback(() => {
    window.api.webFrameZoomReset();
    setOpenMenu(null);
  }, []);

  const handleSettings = useCallback(() => {
    navigate('/settings');
    setOpenMenu(null);
  }, [navigate]);

  const handleCheckin = useCallback(() => {
    if (activeSession) navigate(`/checkin/${activeSession.id}`);
    setOpenMenu(null);
  }, [activeSession, navigate]);

  const handleMatch = useCallback(() => {
    if (activeSession) navigate(`/match/${activeSession.id}`);
    setOpenMenu(null);
  }, [activeSession, navigate]);

  const menus: Menu[] = [
    {
      label: '文件',
      items: [
        { label: '新建 Session', shortcut: '⌘N', action: handleNewSession, disabled: !!activeSession },
        { label: '结束当前 Session', shortcut: '⌘W', action: handleEndSession, disabled: !activeSession },
        { label: '导出数据', shortcut: '⌘E', action: handleExport },
        { label: '', separator: true },
        { label: '退出', shortcut: '⌘Q', action: handleQuit },
      ],
    },
    {
      label: '球员',
      items: [
        { label: '添加球员', shortcut: '⇧⌘N', action: handleAddPlayer },
        { label: '搜索球员', shortcut: '⌘F', action: handleSearchPlayer },
        { label: '管理球员', action: () => { navigate('/players'); setOpenMenu(null); } },
      ],
    },
    {
      label: 'Session',
      items: [
        { label: '签到', action: handleCheckin, disabled: !activeSession },
        { label: '生成对战', action: () => { window.dispatchEvent(new CustomEvent('menu:generate-matches')); setOpenMenu(null); }, disabled: !activeSession },
        { label: '开始下一轮', action: () => { window.dispatchEvent(new CustomEvent('menu:start-round')); setOpenMenu(null); }, disabled: !activeSession },
      ],
    },
    {
      label: '视图',
      items: [
        { label: '全屏', shortcut: '⌃⌘F', action: handleFullscreen },
        { label: '放大', shortcut: '⌘+', action: handleZoomIn },
        { label: '缩小', shortcut: '⌘-', action: handleZoomOut },
        { label: '重置缩放', shortcut: '⌘0', action: handleZoomReset },
        { label: '', separator: true },
        { label: '设置', shortcut: '⌘,', action: handleSettings },
      ],
    },
  ];

  return (
    <div ref={menuRef} className="flex items-center h-8 bg-gray-100 border-b border-gray-200 select-none shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {menus.map((menu, i) => (
          <div key={menu.label} className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === i ? null : i)}
              onMouseEnter={() => { if (openMenu !== null) setOpenMenu(i); }}
              className={`h-full px-3 text-[13px] transition-colors ${
                openMenu === i ? 'bg-gray-200 text-gray-900' : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              {menu.label}
            </button>

            {openMenu === i && (
              <div className="absolute top-full left-0 z-50 min-w-[220px] bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                {menu.items.map((item, j) =>
                  item.separator ? (
                    <div key={j} className="my-1 border-t border-gray-200" />
                  ) : (
                    <button
                      key={j}
                      onClick={() => { if (!item.disabled && item.action) item.action(); }}
                      disabled={item.disabled}
                      className={`w-full text-left px-3 py-1.5 text-[13px] flex items-center justify-between ${
                        item.disabled
                          ? 'text-gray-300 cursor-default'
                          : 'text-gray-700 hover:bg-blue-500 hover:text-white'
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span className={`ml-6 text-[11px] ${item.disabled ? 'text-gray-300' : 'text-gray-400'}`}>
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* App title in center */}
      <div className="flex-1 text-center text-[13px] text-gray-500 font-medium pointer-events-none">
        AutoRally
      </div>
    </div>
  );
}
