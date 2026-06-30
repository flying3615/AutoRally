import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { levelBadgeClasses, genderColors } from '../theme';

ModuleRegistry.registerModules([AllCommunityModule]);

interface PlayerWithBalance {
  id: string;
  name: string;
  gender: string;
  level: number;
  phone: string;
  email: string;
  club: string;
  joinDate: string;
  balance: number;
}

const levelLabels = ['', 'Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];

function NameCell({ value, data }: ICellRendererParams<PlayerWithBalance>) {
  if (!data) return null;
  const isMale = data.gender === 'male';
  return (
    <div className="flex items-center gap-2.5 h-full">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
        style={{ backgroundColor: isMale ? genderColors.male.accent : genderColors.female.accent }}
      >
        {value?.[0] ?? ''}
      </div>
      <span className="font-bold text-zinc-900 truncate">{value}</span>
    </div>
  );
}

function GenderCell({ value }: ICellRendererParams<PlayerWithBalance>) {
  const isMale = value === 'male';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${
      isMale ? 'bg-blue-50 text-blue-700' : 'bg-pink-50 text-pink-700'
    }`}>
      {isMale ? '♂ Male' : '♀ Female'}
    </span>
  );
}

function LevelCell({ value }: ICellRendererParams<PlayerWithBalance>) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${levelBadgeClasses[value] ?? 'bg-zinc-100 text-zinc-700'}`}>
      {levelLabels[value] ?? value}
    </span>
  );
}

function PhoneCell({ value }: ICellRendererParams<PlayerWithBalance>) {
  return <span className="text-zinc-500 tabular-nums font-mono">{value || <span className="text-zinc-300">—</span>}</span>;
}

function BalanceCell({ value }: ICellRendererParams<PlayerWithBalance>) {
  return (
    <span className={`font-semibold tabular-nums font-mono ${value < 30 ? 'text-red-500' : 'text-zinc-700'}`}>
      ${value.toFixed(0)}
    </span>
  );
}

function ActionsCell({ data }: ICellRendererParams<PlayerWithBalance>) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setConfirmDelete(false);
    };
    const keyClose = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setConfirmDelete(false); } };
    setTimeout(() => {
      document.addEventListener('mousedown', close);
      document.addEventListener('keydown', keyClose);
    }, 0);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', keyClose); };
  }, [open]);

  if (!data) return null;

  const handleEdit = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('playerEdit', { detail: data }));
  };

  const handleTopup = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('playerTopup', { detail: data }));
  };

  const handleDelete = async () => {
    await window.api.playersDelete(data.id);
    setOpen(false);
    setConfirmDelete(false);
    window.dispatchEvent(new CustomEvent('playerDeleted'));
  };

  const menuPos = () => {
    if (!btnRef.current) return { top: 0, left: 0 };
    const r = btnRef.current.getBoundingClientRect();
    return { top: r.bottom + 4, right: window.innerWidth - r.right };
  };

  const pos = open ? menuPos() : { top: 0, right: 0 };

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => { setOpen(!open); setConfirmDelete(false); }}
        aria-label={`Open actions for ${data.name}`}
        className="w-7 h-7 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all inline-flex items-center justify-center"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[200] min-w-[160px] bg-white border border-zinc-200/80 rounded-xl shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.03)] py-1"
          style={{ top: pos.top, right: pos.right, animation: 'ctxFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          <button
            onClick={handleTopup}
            className="w-full text-left px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2.5 transition-colors"
          >
            <svg className="w-4 h-4 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
            </svg>
            Top Up
          </button>
          <button
            onClick={handleEdit}
            className="w-full text-left px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2.5 transition-colors"
          >
            <svg className="w-4 h-4 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            </svg>
            Edit Player
          </button>
          <div className="my-1 border-t border-zinc-100" />
          {confirmDelete ? (
            <div className="px-3 py-2">
              <p className="text-xs text-zinc-500 mb-2">Delete this player?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  className="flex-1 h-7 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-all"
                >
                  Delete
                </button>
                <button
                  onClick={() => { setConfirmDelete(false); setOpen(false); }}
                  className="flex-1 h-7 text-xs text-zinc-500 hover:bg-zinc-100 rounded-lg transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
            >
              <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              Delete
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

export function Players() {
  const [players, setPlayers] = useState<PlayerWithBalance[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: '', surname: '', gender: 'male', level: 3, phone: '', email: '', club: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [topupPlayer, setTopupPlayer] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<AgGridReact>(null);

  const load = useCallback(() => window.api.playersList().then((p: PlayerWithBalance[]) => setPlayers(p)), []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = () => { setShowForm(true); setEditingId(null); setForm({ firstName: '', surname: '', gender: 'male', level: 3, phone: '', email: '', club: '' }); setFormErrors({}); };
    window.addEventListener('menu:add-player', handler);
    return () => window.removeEventListener('menu:add-player', handler);
  }, []);

  useEffect(() => {
    const handler = () => { setSearch(''); searchRef.current?.focus(); };
    window.addEventListener('menu:search-player', handler);
    return () => window.removeEventListener('menu:search-player', handler);
  }, []);

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    if (!form.firstName.trim()) errors.firstName = 'First name is required';
    if (!form.surname.trim()) errors.surname = 'Surname is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) && form.email.trim()) {
      errors.email = 'Invalid email format';
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const name = [form.firstName.trim(), form.surname.trim()].filter(Boolean).join(' ');
    const playerData = { name, gender: form.gender, level: form.level, phone: form.phone, email: form.email.trim(), club: form.club.trim() };
    if (editingId) {
      await window.api.playersUpdate(editingId, playerData);
    } else {
      await window.api.playersCreate(playerData);
    }
    setForm({ firstName: '', surname: '', gender: 'male', level: 3, phone: '', email: '', club: '' });
    setFormErrors({});
    setEditingId(null);
    setShowForm(false);
    load();
  };

  const handleEdit = (p: PlayerWithBalance) => {
    const spaceIdx = p.name.indexOf(' ');
    const firstName = spaceIdx > 0 ? p.name.slice(0, spaceIdx) : p.name;
    const surname = spaceIdx > 0 ? p.name.slice(spaceIdx + 1) : '';
    setForm({ firstName, surname, gender: p.gender, level: p.level, phone: p.phone, email: (p as any).email ?? '', club: (p as any).club ?? '' });
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleTopup = async () => {
    if (!topupPlayer || !topupAmount || Number(topupAmount) <= 0) return;
    await window.api.paymentsTopup(topupPlayer, Number(topupAmount));
    setTopupPlayer(null);
    setTopupAmount('');
    load();
  };

  useEffect(() => {
    const onEdit = (e: Event) => handleEdit((e as CustomEvent<PlayerWithBalance>).detail);
    const onTopup = (e: Event) => setTopupPlayer((e as CustomEvent<PlayerWithBalance>).detail.id);
    const onDeleted = () => load();
    window.addEventListener('playerEdit', onEdit);
    window.addEventListener('playerTopup', onTopup);
    window.addEventListener('playerDeleted', onDeleted);
    return () => {
      window.removeEventListener('playerEdit', onEdit);
      window.removeEventListener('playerTopup', onTopup);
      window.removeEventListener('playerDeleted', onDeleted);
    };
  }, [load]);

  // External filter
  const isExternalFilterPresent = useCallback(() => search.trim().length > 0, [search]);
  const doesExternalFilterPass = useCallback((node: any) => {
    const p = node.data as PlayerWithBalance;
    if (!p) return false;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.phone.includes(q);
  }, [search]);

  const onSearchChange = (val: string) => {
    setSearch(val);
    gridRef.current?.api.onFilterChanged();
  };

  const colDefs: ColDef<PlayerWithBalance>[] = [
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 160, cellRenderer: NameCell, sortable: true },
    { field: 'gender', headerName: 'Gender', width: 110, cellRenderer: GenderCell, sortable: true },
    { field: 'level', headerName: 'Level', width: 130, cellRenderer: LevelCell, sortable: true },
    { field: 'phone', headerName: 'Phone', width: 140, cellRenderer: PhoneCell, sortable: true },
    { field: 'email', headerName: 'Email', flex: 1, minWidth: 160, sortable: true, valueFormatter: (p: any) => p.value || '—' },
    { field: 'club', headerName: 'Club', width: 140, sortable: true, valueFormatter: (p: any) => p.value || '—' },
    { field: 'balance', headerName: 'Balance', width: 110, cellRenderer: BalanceCell, sortable: true },
    { headerName: '', width: 56, cellRenderer: ActionsCell, sortable: false, resizable: false, suppressMovable: true },
  ];

  const defaultColDef: ColDef = {
    resizable: true,
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-[90%] mx-auto px-8 py-10" style={{ animation: 'fadeIn 0.3s ease' }}>

        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <p className="text-sm text-zinc-400 font-medium">{players.length} registered</p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search players..."
                className="h-8 w-48 pl-8 pr-3 text-sm bg-white border border-zinc-200 rounded-lg
                  focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all"
              />
            </div>
            <button
              onClick={async () => {
                setImporting(true);
                setImportResult(null);
                const result = await window.api.playersImportCsv();
                setImportResult(result);
                setImporting(false);
                if (result.imported > 0) load();
              }}
              disabled={importing}
              className="h-8 px-3 text-sm font-medium text-zinc-600 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 active:scale-[0.97] transition-all inline-flex items-center justify-center disabled:opacity-50"
            >
              {importing ? 'Importing...' : 'Import CSV'}
            </button>
            <button
              onClick={() => { setShowForm(true); setEditingId(null); setForm({ firstName: '', surname: '', gender: 'male', level: 3, phone: '', email: '', club: '' }); setFormErrors({}); }}
              className="h-8 px-4 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 active:scale-[0.97] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2)] transition-all inline-flex items-center justify-center"
            >
              Add Player
            </button>
          </div>
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 mb-6 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.04)]" style={{ animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <h3 className="text-sm font-bold text-zinc-900 mb-4">{editingId ? 'Edit Player' : 'Add Player'}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-1.5">
                  First Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text" value={form.firstName}
                  onChange={(e) => { setForm({ ...form, firstName: e.target.value }); setFormErrors({ ...formErrors, firstName: '' }); }}
                  className={`w-full h-9 px-3 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 transition-all ${
                    formErrors.firstName
                      ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                      : 'border-zinc-200 focus:ring-gray-200/80 focus:border-zinc-300'
                  }`}
                  autoFocus
                />
                {formErrors.firstName && <p className="text-[11px] text-red-400 mt-1 font-medium">{formErrors.firstName}</p>}
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-1.5">
                  Surname <span className="text-red-400">*</span>
                </label>
                <input
                  type="text" value={form.surname}
                  onChange={(e) => { setForm({ ...form, surname: e.target.value }); setFormErrors({ ...formErrors, surname: '' }); }}
                  className={`w-full h-9 px-3 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 transition-all ${
                    formErrors.surname
                      ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                      : 'border-zinc-200 focus:ring-gray-200/80 focus:border-zinc-300'
                  }`}
                />
                {formErrors.surname && <p className="text-[11px] text-red-400 mt-1 font-medium">{formErrors.surname}</p>}
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-1.5">Gender</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setForm({ ...form, gender: 'male' })}
                    className={`flex-1 h-9 text-sm rounded-lg transition-all duration-150 inline-flex items-center justify-center font-medium ${
                      form.gender === 'male'
                        ? 'bg-blue-600 text-white shadow-[0_1px_3px_rgba(37,99,235,0.3)]'
                        : 'bg-white border border-zinc-200 text-zinc-500 hover:border-blue-200 hover:text-blue-600'
                    }`}
                  >
                    ♂ Male
                  </button>
                  <button
                    onClick={() => setForm({ ...form, gender: 'female' })}
                    className={`flex-1 h-9 text-sm rounded-lg transition-all duration-150 inline-flex items-center justify-center font-medium ${
                      form.gender === 'female'
                        ? 'bg-rose-600 text-white shadow-[0_1px_3px_rgba(225,29,72,0.3)]'
                        : 'bg-white border border-zinc-200 text-zinc-500 hover:border-rose-200 hover:text-rose-600'
                    }`}
                  >
                    ♀ Female
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-1.5">Level</label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map(l => (
                    <button
                      key={l}
                      onClick={() => setForm({ ...form, level: l })}
                      className={`flex-1 h-9 text-sm rounded-lg transition-all duration-150 inline-flex items-center justify-center font-medium ${
                        form.level === l
                          ? 'bg-zinc-900 text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]'
                          : 'bg-white border border-zinc-200 text-zinc-500 hover:border-zinc-300'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-1.5">Phone</label>
                <input
                  type="text" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full h-9 px-3 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200/80 focus:border-zinc-300 transition-all"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-1.5">Email</label>
                <input
                  type="email" value={form.email}
                  onChange={(e) => { setForm({ ...form, email: e.target.value }); setFormErrors({ ...formErrors, email: '' }); }}
                  className={`w-full h-9 px-3 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 transition-all ${
                    formErrors.email
                      ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                      : 'border-zinc-200 focus:ring-gray-200/80 focus:border-zinc-300'
                  }`}
                  placeholder="player@example.com"
                />
                {formErrors.email && <p className="text-[11px] text-red-400 mt-1 font-medium">{formErrors.email}</p>}
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-1.5">Club</label>
                <input
                  type="text" value={form.club}
                  onChange={(e) => setForm({ ...form, club: e.target.value })}
                  className="w-full h-9 px-3 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200/80 focus:border-zinc-300 transition-all"
                  placeholder="Club name (optional)"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={handleSave}
                className="h-8 px-4 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 active:scale-[0.97] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2)] transition-all inline-flex items-center justify-center"
              >
                {editingId ? 'Save' : 'Add'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); setFormErrors({}); }}
                className="h-8 px-4 text-sm text-zinc-500 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 active:scale-[0.97] transition-all inline-flex items-center justify-center"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Import result notification */}
        {importResult && (
          <div className={`mb-4 rounded-xl border p-4 text-sm ${
            importResult.errors.length > 0
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {importResult.errors.length > 0 ? (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span className="font-semibold">
                Imported <strong>{importResult.imported}</strong> players
                {importResult.skipped > 0 && <>, skipped <strong>{importResult.skipped}</strong> duplicates</>}
              </span>
              <button onClick={() => setImportResult(null)} aria-label="Dismiss import result" className="ml-auto text-zinc-400 hover:text-zinc-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {importResult.errors.length > 0 && (
              <ul className="text-xs mt-1 space-y-0.5 text-amber-700">
                {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}

        {/* AG Grid */}
        {players.length > 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200/80 overflow-hidden shadow-[0_2px_8px_-4px_rgba(0,0,0,0.04)]">
            <div className="ag-theme-quartz" style={{ width: '100%' }}>
              <AgGridReact<PlayerWithBalance>
                ref={gridRef}
                rowData={players}
                columnDefs={colDefs}
                defaultColDef={defaultColDef}
                domLayout="autoHeight"
                rowHeight={52}
                headerHeight={38}
                suppressCellFocus
                suppressRowClickSelection
                isExternalFilterPresent={isExternalFilterPresent}
                doesExternalFilterPass={doesExternalFilterPass}
                pagination={true}
                paginationPageSize={15}
                paginationPageSizeSelector={[10, 15, 25, 50]}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center pt-24">
            <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center mb-4 border border-zinc-100">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-300">
                <circle cx="10" cy="7" r="3.5" />
                <path d="M3 18c0-3.3 3.1-6 7-6s7 2.7 7 6" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-zinc-500 mb-1">No players yet</p>
            <p className="text-xs text-zinc-400">Click above to add the first player</p>
          </div>
        )}
      </div>

      {/* Topup Modal */}
      {topupPlayer && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setTopupPlayer(null)}>
          <div className="bg-white rounded-2xl p-6 w-80 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.03)]" onClick={e => e.stopPropagation()}
            style={{ animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <h3 className="text-sm font-bold text-zinc-900 mb-4">Top Up</h3>
            <input
              type="number" value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              placeholder="Top up amount"
              className="w-full h-9 px-3 text-sm border border-zinc-200 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-gray-200/80 focus:border-zinc-300 transition-all"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleTopup}
                className="flex-1 h-8 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 active:scale-[0.97] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2)] transition-all inline-flex items-center justify-center"
              >
                Confirm
              </button>
              <button
                onClick={() => setTopupPlayer(null)}
                className="flex-1 h-8 text-sm text-zinc-500 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 active:scale-[0.97] transition-all inline-flex items-center justify-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
