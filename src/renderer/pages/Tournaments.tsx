import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';

interface TournamentRow {
  id: string;
  name: string;
  description: string;
  date: string;
  format: 'knockout' | 'round_robin' | 'mixed';
  status: 'upcoming' | 'active' | 'completed';
  courtCount: number;
  registrationCount: number;
  createdAt: string;
}

function formatLabel(fmt: string) {
  if (fmt === 'knockout') return 'Knockout';
  if (fmt === 'round_robin') return 'Round Robin';
  return 'Mixed';
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [format, setFormat] = useState('round_robin');
  const [courtCount, setCourtCount] = useState('4');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim() || !date) return;
    setSaving(true);
    setError(null);
    try {
      const created = await window.api.tournamentsCreate({
        name: name.trim(),
        description,
        date,
        format,
        courtCount: Number(courtCount) || 4,
      }) as { id: string };
      onCreated(created.id);
    } catch (err: any) {
      setError(err?.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-[420px] max-w-[90vw]" onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 24px 48px -12px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04)', animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <h3 className="text-lg font-bold text-zinc-900 tracking-tight mb-5">Create Tournament</h3>

        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400" placeholder="Club Championship 2026" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Courts</label>
              <input type="number" min="1" max="10" value={courtCount} onChange={e => setCourtCount(e.target.value)} className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Format</label>
            <div className="flex gap-2">
              {(['knockout', 'round_robin', 'mixed'] as const).map(f => (
                <button key={f} onClick={() => setFormat(f)}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-all active:scale-95 ${format === f ? 'bg-zinc-800 border-zinc-900 text-white' : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}
                >
                  {formatLabel(f)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 rounded-xl transition-colors">Cancel</button>
          <button onClick={handleCreate} disabled={saving || !name.trim() || !date}
            className="px-5 py-2 text-sm font-semibold bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 active:scale-[0.97] transition-all disabled:opacity-40">
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Tournaments() {
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    const list = await window.api.tournamentsList() as TournamentRow[];
    setRows(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const columnDefs: any[] = useMemo(() => [
    { headerName: 'Name', field: 'name', flex: 1, minWidth: 160 },
    { headerName: 'Date', field: 'date', width: 120 },
    {
      headerName: 'Format',
      field: 'format',
      width: 130,
      cellRenderer: (p: any) => formatLabel(p.value),
    },
    {
      headerName: 'Status',
      field: 'status',
      width: 110,
      cellRenderer: (p: any) => {
        const s = p.value as string;
        const clr = s === 'active' ? '#059669' : s === 'completed' ? '#78716c' : '#3b82f6';
        const bg = s === 'active' ? '#ecfdf5' : s === 'completed' ? '#f5f5f4' : '#eff6ff';
        return <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ color: clr, backgroundColor: bg }}>{s}</span>;
      },
    },
    { headerName: 'Players', field: 'registrationCount', width: 90 },
    {
      headerName: '',
      field: 'id',
      width: 110,
      sortable: false,
      resizable: false,
      cellRenderer: (p: any) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/tournaments/${p.value}`);
          }}
          className="h-7 px-3 text-xs font-semibold text-zinc-700 border border-zinc-200 rounded-lg hover:bg-zinc-50 active:scale-[0.97] transition-all"
        >
          Manage
        </button>
      ),
    },
  ], [navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-40 h-4 skeleton" />
      </div>
    );
  }

  const activeCount = rows.filter(r => r.status === 'active').length;
  const upcomingCount = rows.filter(r => r.status === 'upcoming').length;
  const completedCount = rows.filter(r => r.status === 'completed').length;

  return (
    <div className="ar-page">
      <div className="ar-page-inner">
        <div className="ar-page-header">
          <div>
            <h1 className="ar-page-title">Tournaments</h1>
            <p className="ar-page-copy">{rows.length} tournaments across active, upcoming, and completed events.</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="ar-primary-button">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Create Tournament
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="ar-stat-card">
            <p className="ar-stat-label">Total</p>
            <p className="ar-stat-value">{rows.length}</p>
          </div>
          <div className="ar-stat-card">
            <p className="ar-stat-label">Active</p>
            <p className="ar-stat-value !text-emerald-600">{activeCount}</p>
          </div>
          <div className="ar-stat-card">
            <p className="ar-stat-label">Upcoming</p>
            <p className="ar-stat-value !text-2xl">{upcomingCount}</p>
          </div>
          <div className="ar-stat-card">
            <p className="ar-stat-label">Completed</p>
            <p className="ar-stat-value !text-2xl">{completedCount}</p>
          </div>
        </div>

        <div className="ar-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="ar-section-label">Tournament registry</p>
            <p className="text-[11px] text-zinc-400 tabular-nums font-mono">{rows.length} records</p>
          </div>
          <div className="ar-table-shell">
            <div className="ag-theme-quartz" style={{ width: '100%' }}>
              <AgGridReact
                rowData={rows}
                columnDefs={columnDefs}
                defaultColDef={{ sortable: true, resizable: true, flex: 1 }}
                domLayout="autoHeight"
                rowHeight={52}
                headerHeight={38}
                onRowDoubleClicked={(e) => { if (e.data) navigate(`/tournaments/${e.data.id}`); }}
              />
            </div>
          </div>
        </div>
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); navigate(`/tournaments/${id}`); }} />}
    </div>
  );
}
