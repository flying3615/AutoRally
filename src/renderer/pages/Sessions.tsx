import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

interface SessionInfo {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  courtCount: number;
  status: string;
}

const formatTime = (t: string | null) => t ? new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-';

function CourtsCell({ value }: ICellRendererParams<SessionInfo>) {
  return <span className="text-zinc-500 tabular-nums font-medium">{value} courts</span>;
}

function TimeCell({ value }: ICellRendererParams<SessionInfo>) {
  return <span className="text-zinc-500 tabular-nums">{formatTime(value)}</span>;
}

function StatusCell({ data }: ICellRendererParams<SessionInfo>) {
  if (!data) return null;
  const isActive = data.status === 'active';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
      isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
    }`}>
      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
      {isActive ? 'Active' : 'Ended'}
    </span>
  );
}

export function Sessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSession, setActiveSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmEndId, setConfirmEndId] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>();

  const load = async () => {
    const [all, active] = await Promise.all([
      window.api.sessionsList(),
      window.api.sessionsGetActive(),
    ]);
    setSessions(all as SessionInfo[]);
    setActiveSession((active as SessionInfo | undefined) ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (activeSession) return;
    const settings = await window.api.settingsGetAll() as Record<string, string>;
    const courtCount = Number(settings.courtCount ?? '3');
    await window.api.sessionsCreate(courtCount);
    load();
  };

  const handleEnd = async (id: string) => {
    await window.api.sessionsEnd(id);
    setConfirmEndId(null);
    load();
  };

  const requestEnd = (id: string) => {
    setConfirmEndId(id);
    clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmEndId(null), 3000);
  };

  const colDefs: ColDef<SessionInfo>[] = [
    { field: 'date', headerName: 'Date', flex: 1, minWidth: 120, sortable: true, cellClass: 'font-medium text-zinc-900 tabular-nums' },
    { field: 'courtCount', headerName: 'Courts', width: 100, cellRenderer: CourtsCell, sortable: true },
    { field: 'startTime', headerName: 'Start', width: 100, cellRenderer: TimeCell, sortable: true },
    { field: 'endTime', headerName: 'End', width: 100, cellRenderer: TimeCell, sortable: true },
    { field: 'status', headerName: 'Status', flex: 1, minWidth: 80, cellRenderer: StatusCell, sortable: true },
  ];

  const defaultColDef: ColDef = { resizable: true };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-40 h-4 skeleton" />
          <div className="w-28 h-3 skeleton" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-10" style={{ animation: 'fadeIn 0.3s ease' }}>

        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Sessions</h2>
            <p className="text-sm text-zinc-400 mt-0.5">Manage training sessions and court arrangements</p>
          </div>
          <button
            onClick={handleCreate}
            disabled={!!activeSession}
            className="h-8 px-4 text-sm font-medium bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-zinc-800 disabled:active:scale-100 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] transition-all inline-flex items-center justify-center"
          >
            New Session
          </button>
        </div>

        {/* Active session */}
        {activeSession && (
          <div className="relative overflow-hidden rounded-2xl bg-zinc-900 mb-8 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]">
            <div className="dot-pattern" />
            <div className="relative p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.4)]" />
                  <div>
                    <p className="text-[15px] font-semibold text-white tracking-tight">Current session</p>
                    <p className="text-sm text-zinc-400 mt-0.5 tabular-nums font-medium font-mono">
                      {activeSession.date} · {activeSession.courtCount} courts · {formatTime(activeSession.startTime)} started
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/checkin/${activeSession.id}`}
                    className="h-8 px-3.5 text-sm font-medium bg-white/10 text-white rounded-lg hover:bg-white/15 active:scale-[0.97] transition-all inline-flex items-center justify-center"
                  >
                    Check-in
                  </Link>
                  <Link
                    to={`/match/${activeSession.id}`}
                    className="h-8 px-3.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 active:scale-[0.97] shadow-[0_2px_8px_-2px_rgba(5,150,105,0.3)] transition-all inline-flex items-center justify-center"
                  >
                    Match Panel
                  </Link>
                  {confirmEndId === activeSession.id ? (
                    <button
                      onClick={() => handleEnd(activeSession.id)}
                      className="h-8 px-3.5 text-sm font-medium bg-red-600/90 text-white rounded-lg hover:bg-red-500 active:scale-[0.97] shadow-[0_2px_8px_-2px_rgba(220,38,38,0.3)] transition-all inline-flex items-center justify-center"
                    >
                      Confirm End
                    </button>
                  ) : (
                    <button
                      onClick={() => requestEnd(activeSession.id)}
                      className="h-8 px-3.5 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg active:scale-[0.97] transition-all inline-flex items-center justify-center"
                    >
                      End
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Session list — AG Grid */}
        {sessions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">History</p>
              <p className="text-[11px] text-zinc-400 tabular-nums font-mono">{sessions.length} records</p>
            </div>
            <div className="bg-white rounded-2xl border border-zinc-200/60 overflow-hidden shadow-[0_2px_8px_-4px_rgba(0,0,0,0.04)]">
              <div className="ag-theme-quartz" style={{ width: '100%' }}>
              <AgGridReact<SessionInfo>
                rowData={sessions}
                columnDefs={colDefs}
                defaultColDef={defaultColDef}
                domLayout="autoHeight"
                rowHeight={44}
                headerHeight={38}
                suppressCellFocus
                suppressRowClickSelection
              />
            </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!activeSession && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-24">
            <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center mb-4 border border-zinc-100">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-300">
                <rect x="2" y="4" width="16" height="12" rx="2" />
                <path d="M6 4V2.5M14 4V2.5M2 8h16" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-zinc-500 mb-1">No sessions yet</p>
            <p className="text-xs text-zinc-400">Configure courts in Settings, then create your first session</p>
          </div>
        )}
      </div>
    </div>
  );
}
