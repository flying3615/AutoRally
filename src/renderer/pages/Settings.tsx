import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { confirm } from '../stores/confirmStore';

interface SettingsData {
  courtCount: string;
  sessionFee: string;
  gameDuration: string;
}

interface UpcomingSession {
  id: string;
  date: string;
  time: string;
  note: string;
}

interface HistoricalDataCleanupResult {
  payments: number;
  sessions: number;
  tournaments: number;
}

const durations = [
  { value: '10', label: '10 min' },
  { value: '12', label: '12 min' },
  { value: '15', label: '15 min' },
  { value: '20', label: '20 min' },
  { value: '25', label: '25 min' },
  { value: '30', label: '30 min' },
];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function SessionModal({ session, onClose, onSaved }: {
  session: UpcomingSession | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = session !== null;
  const [date, setDate] = useState(session?.date ?? '');
  const [time, setTime] = useState(session?.time ?? '');
  const [note, setNote] = useState(session?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!date) return;
    if (date < todayStr()) {
      setError('Date cannot be in the past');
      return;
    }
    if (date === todayStr() && time) {
      const now = new Date();
      const [h, m] = time.split(':').map(Number);
      if (h !== undefined && m !== undefined) {
        const selected = new Date();
        selected.setHours(h, m, 0, 0);
        if (selected <= now) {
          setError('Time cannot be in the past');
          return;
        }
      }
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && session) {
        await window.api.upcomingSessionsUpdate(session.id, { date, time, note });
      } else {
        await window.api.upcomingSessionsCreate({ date, time, note });
      }
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-[400px] max-w-[90vw]" onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 24px 48px -12px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04)', animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <h3 className="text-lg font-bold text-zinc-900 tracking-tight mb-4">
          {isEdit ? 'Edit Session' : 'Add Session'}
        </h3>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1">Date</label>
            <input
              type="date"
              value={date}
              min={todayStr()}
              onChange={(e) => { setDate(e.target.value); setError(null); }}
              className="w-full px-3 py-2 text-sm border-2 border-zinc-200 rounded-xl
                focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1">Time</label>
            <div className="flex gap-2">
              <select
                value={time ? time.split(':')[0] : ''}
                onChange={(e) => {
                  const h = e.target.value;
                  const m = time ? time.split(':')[1] ?? '00' : '00';
                  setTime(h ? `${h}:${m}` : '');
                  setError(null);
                }}
                className="flex-1 px-3 py-2 text-sm border-2 border-zinc-200 rounded-xl
                  focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all bg-white"
              >
                <option value="">Hour</option>
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={String(i).padStart(2, '0')}>
                    {String(i).padStart(2, '0')}
                  </option>
                ))}
              </select>
              <select
                value={time ? time.split(':')[1] ?? '' : ''}
                onChange={(e) => {
                  const m = e.target.value;
                  const h = time ? time.split(':')[0] ?? '00' : '00';
                  setTime(m ? `${h}:${m}` : '');
                  setError(null);
                }}
                className="flex-1 px-3 py-2 text-sm border-2 border-zinc-200 rounded-xl
                  focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all bg-white"
              >
                <option value="">Min</option>
                <option value="00">00</option>
                <option value="30">30</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-xs font-semibold text-zinc-500 mb-1">Note</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Venue change, bring extra shuttlecocks"
            maxLength={80}
            className="w-full px-3 py-2 text-sm border-2 border-zinc-200 rounded-xl
              focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !date}
            className="flex-1 h-10 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 active:scale-[0.97] transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Session'}
          </button>
          <button
            onClick={onClose}
            className="h-10 px-5 text-sm font-medium text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoricalDataCleanupDialog({ onClose, onSuccess }: {
  onClose: () => void;
  onSuccess: (result: HistoricalDataCleanupResult) => void;
}) {
  const [confirmationText, setConfirmationText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmationInputRef = useRef<HTMLInputElement>(null);
  const canClear = confirmationText === 'CLEAR' && !busy;

  useEffect(() => {
    confirmationInputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose]);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    if (!firstFocusable || !lastFocusable) return;

    const activeElement = document.activeElement;
    if (event.shiftKey && activeElement === firstFocusable) {
      event.preventDefault();
      lastFocusable.focus();
    } else if (!event.shiftKey && activeElement === lastFocusable) {
      event.preventDefault();
      firstFocusable.focus();
    }
  };

  const handleClear = async () => {
    if (!canClear) return;

    confirmationInputRef.current?.focus();
    setBusy(true);
    setError(null);
    try {
      const result = await window.api.dataClearHistory();
      onSuccess(result);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to clear historical data');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/30"
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="historical-data-cleanup-title"
        ref={dialogRef}
        onKeyDown={handleDialogKeyDown}
        className="bg-white rounded-2xl p-6 w-[440px] max-w-[90vw]"
        style={{
          boxShadow: '0 24px 48px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.04)',
          animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <h3 id="historical-data-cleanup-title" className="text-lg font-bold text-zinc-900 tracking-tight mb-2">
          Clear historical data
        </h3>
        <p className="text-sm text-zinc-500 leading-relaxed">
          Completed daily sessions, all payments and top-ups, and tournaments marked completed or dated before today will be permanently deleted.
          Players, balances, settings, upcoming sessions, active daily sessions, and non-completed tournaments dated today or later remain.
        </p>

        {error && (
          <div role="alert" className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
        )}

        <div className="mt-5">
          <label htmlFor="historical-data-confirmation" className="block text-xs font-semibold text-zinc-500 mb-1">
            Type CLEAR to confirm
          </label>
          <input
            id="historical-data-confirmation"
            ref={confirmationInputRef}
            value={confirmationText}
            onChange={(event) => {
              setConfirmationText(event.target.value);
              setError(null);
            }}
            className="w-full px-3 py-2 text-sm border-2 border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all"
          />
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold border border-zinc-200 text-zinc-600 rounded-xl hover:bg-zinc-50 active:scale-[0.97] disabled:opacity-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleClear}
            disabled={!canClear}
            className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl active:scale-[0.97] disabled:opacity-50 transition-all"
          >
            {busy ? 'Clearing...' : 'Permanently Clear Data'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Settings() {
  const [settings, setSettings] = useState<SettingsData>({ courtCount: '3', sessionFee: '10', gameDuration: '15' });
  const [saved, setSaved] = useState(false);
  const { upcomingSessions: upcoming, refreshUpcoming } = useSessionStore();
  const [modalSession, setModalSession] = useState<UpcomingSession | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [backupBusy, setBackupBusy] = useState<'export' | 'import' | null>(null);
  const [backupMessage, setBackupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showHistoricalDataCleanup, setShowHistoricalDataCleanup] = useState(false);
  const [historicalDataCleanupMessage, setHistoricalDataCleanupMessage] = useState<string | null>(null);
  const historicalDataCleanupOpenerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    window.api.settingsGetAll().then((s: Record<string, string>) => {
      setSettings({
        courtCount: s.courtCount ?? '3',
        sessionFee: s.sessionFee ?? '10',
        gameDuration: s.gameDuration ?? '15',
      });
    });
    window.api.appVersion().then(setAppVersion).catch(() => setAppVersion(''));
    refreshUpcoming();
  }, []);

  const handleSave = async () => {
    await window.api.settingsSet('courtCount', settings.courtCount);
    await window.api.settingsSet('sessionFee', settings.sessionFee);
    await window.api.settingsSet('gameDuration', settings.gameDuration);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDelete = async (id: string) => {
    await window.api.upcomingSessionsDelete(id);
    refreshUpcoming();
  };

  const handleExportBackup = async () => {
    setBackupBusy('export');
    setBackupMessage(null);
    try {
      const result = await window.api.dataExportBackup();
      if (!result.canceled) {
        setBackupMessage({ type: 'success', text: `Backup exported to ${result.filePath}` });
      }
    } catch (err: any) {
      setBackupMessage({ type: 'error', text: err?.message ?? 'Failed to export backup' });
    } finally {
      setBackupBusy(null);
    }
  };

  const handleImportBackup = async () => {
    const ok = await confirm({
      title: 'Import backup?',
      message: 'Importing a backup will replace all current players, sessions, games, payments, and settings on this computer.',
      confirmLabel: 'Import & Replace',
      danger: true,
    });
    if (!ok) return;

    setBackupBusy('import');
    setBackupMessage(null);
    try {
      const result = await window.api.dataImportBackup();
      if (!result.canceled) {
        setBackupMessage({ type: 'success', text: 'Backup imported. Reloading data...' });
        setTimeout(() => window.location.reload(), 600);
      }
    } catch (err: any) {
      setBackupMessage({ type: 'error', text: err?.message ?? 'Failed to import backup' });
    } finally {
      setBackupBusy(null);
    }
  };

  const closeHistoricalDataCleanup = () => {
    setShowHistoricalDataCleanup(false);
    requestAnimationFrame(() => historicalDataCleanupOpenerRef.current?.focus());
  };

  const handleHistoricalDataCleanupSuccess = (result: HistoricalDataCleanupResult) => {
    const unit = (count: number, name: string) => `${count} ${name}${count === 1 ? '' : 's'}`;
    closeHistoricalDataCleanup();
    setHistoricalDataCleanupMessage(
      `Cleared ${unit(result.payments, 'payment')}, ${unit(result.sessions, 'completed session')}, and ${unit(result.tournaments, 'historical tournament')}.`,
    );
    refreshUpcoming();
  };

  const formatDate = (dateStr: string, timeStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const datePart = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (!timeStr) return datePart;
    const timePart = new Date('2000-01-01T' + timeStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} at ${timePart}`;
  };

  return (
    <>
    <div
      className="h-full overflow-y-auto"
      aria-hidden={showHistoricalDataCleanup}
      inert={showHistoricalDataCleanup}
    >
      <div className="w-[90%] mx-auto px-8 py-10" style={{ animation: 'fadeIn 0.3s ease' }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Settings</h2>
            <p className="text-sm text-zinc-400 mt-0.5">
              Match parameters, fee configuration, and upcoming sessions
              {appVersion && <span className="ml-2 font-mono tabular-nums">v{appVersion}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              className="h-9 px-4 text-sm font-semibold bg-zinc-900 text-white rounded-lg
                hover:bg-zinc-800 active:scale-[0.97] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] transition-all inline-flex items-center justify-center"
            >
              Save Settings
            </button>
            {saved && (
              <span
                className="text-sm font-semibold text-emerald-600"
                style={{ animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
              >
                Saved
              </span>
            )}
          </div>
        </div>

        {/* Court Count */}
        <div className="mb-8">
          <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Court Count</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                onClick={() => setSettings({ ...settings, courtCount: String(n) })}
                className={`flex-1 py-3 text-sm font-semibold rounded-xl border-2 transition-all duration-150 active:scale-95 ${
                  settings.courtCount === String(n)
                    ? 'bg-zinc-900 border-zinc-900 text-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2)]'
                    : 'bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                {n}
              </button>
            ))}
            <div className="flex items-center gap-2 flex-1 min-w-[120px]">
              <input
                type="number"
                min="1"
                max="20"
                value={![1,2,3,4,5,6].includes(Number(settings.courtCount)) ? settings.courtCount : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') return;
                  setSettings({ ...settings, courtCount: v });
                }}
                placeholder="Custom"
                className="w-full py-3 px-3 text-sm font-semibold text-center border-2 border-zinc-200 rounded-xl
                  focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all
                  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>
          <p className="text-xs text-zinc-400 mt-2.5">Number of concurrent matches</p>
        </div>

        {/* Game Duration */}
        <div className="mb-8">
          <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Game Duration</label>
          <div className="grid grid-cols-3 gap-2">
            {durations.map(d => (
              <button
                key={d.value}
                onClick={() => setSettings({ ...settings, gameDuration: d.value })}
                className={`py-3 text-sm font-medium rounded-xl border-2 transition-all duration-150 active:scale-95 ${
                  settings.gameDuration === d.value
                    ? 'bg-zinc-900 border-zinc-900 text-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2)]'
                    : 'bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                {d.label}
              </button>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="120"
                value={!['10','12','15','20','25','30'].includes(settings.gameDuration) ? settings.gameDuration : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') return;
                  setSettings({ ...settings, gameDuration: v });
                }}
                placeholder="Custom (min)"
                className="w-full py-3 px-3 text-sm font-medium text-center border-2 border-zinc-200 rounded-xl
                  focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all
                  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>
          <p className="text-xs text-zinc-400 mt-2.5">Auto-warning and next round scheduling 1 min before end</p>
        </div>

        {/* Session Fee */}
        <div className="mb-10">
          <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Session Fee</label>
          <div className="relative">
            <input
              type="number"
              value={settings.sessionFee}
              onChange={(e) => setSettings({ ...settings, sessionFee: e.target.value })}
              className="w-full px-4 py-3 text-lg font-bold text-zinc-900 border-2 border-zinc-200 rounded-xl
                focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-zinc-400">NZD / person</span>
          </div>
          <p className="text-xs text-zinc-400 mt-2.5">Auto-deducted from balance on check-in</p>
        </div>

        {/* Data Backup */}
        <div className="border-t border-zinc-200 pt-10 mb-10">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h3 className="text-lg font-bold text-zinc-900 tracking-tight">Data Backup</h3>
              <p className="text-sm text-zinc-400 mt-0.5">
                Export or restore the full local database, including players, sessions, games, payments, and settings
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleExportBackup}
                disabled={backupBusy !== null}
                className="h-9 px-4 text-sm font-semibold bg-white border border-zinc-200 text-zinc-700 rounded-lg hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.97] disabled:opacity-50 transition-all inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4.5 19.5h15" />
                </svg>
                {backupBusy === 'export' ? 'Exporting...' : 'Export Backup'}
              </button>
              <button
                onClick={handleImportBackup}
                disabled={backupBusy !== null}
                className="h-9 px-4 text-sm font-semibold bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 hover:border-red-300 active:scale-[0.97] disabled:opacity-50 transition-all inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21V9m0 0l-4 4m4-4l4 4M4.5 4.5h15" />
                </svg>
                {backupBusy === 'import' ? 'Importing...' : 'Import Backup'}
              </button>
            </div>
          </div>

          {backupMessage && (
            <div
              className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${
                backupMessage.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {backupMessage.text}
            </div>
          )}
        </div>

        {/* Historical Data */}
        <div className="border-t border-zinc-200 pt-10 mb-10">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h3 className="text-lg font-bold text-zinc-900 tracking-tight">Historical Data</h3>
              <p className="text-sm text-zinc-400 mt-0.5">
                Permanently remove completed sessions, payments and top-ups, and completed tournaments. Players,
                balances, settings, and current or upcoming activity remain.
              </p>
            </div>
            <button
              ref={historicalDataCleanupOpenerRef}
              onClick={() => {
                setHistoricalDataCleanupMessage(null);
                setShowHistoricalDataCleanup(true);
              }}
              className="h-9 px-4 text-sm font-semibold bg-white border border-red-300 text-red-700 rounded-lg hover:bg-red-50 hover:border-red-400 active:scale-[0.97] transition-all shrink-0"
            >
              Clear Historical Data
            </button>
          </div>

          {historicalDataCleanupMessage && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {historicalDataCleanupMessage}
            </div>
          )}
        </div>

        {/* Upcoming Sessions */}
        <div className="border-t border-zinc-200 pt-10 mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-zinc-900 tracking-tight">Upcoming Sessions</h3>
              <p className="text-sm text-zinc-400 mt-0.5">Scheduled sessions displayed as scrolling text in the header bar</p>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="h-9 px-4 text-sm font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 active:scale-[0.97] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] transition-all inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Session
            </button>
          </div>

          {upcoming.length === 0 ? (
            <div className="text-center py-8 bg-white border-2 border-dashed border-zinc-200 rounded-2xl">
              <p className="text-sm text-zinc-400">No upcoming sessions scheduled</p>
            </div>
          ) : (
            <div className="bg-white border border-zinc-200/60 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Date & Time</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Note</th>
                    <th className="w-20 px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map(s => (
                    <tr key={s.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/50 transition-colors">
                      <td className="px-5 py-3 font-medium text-zinc-800 tabular-nums">{formatDate(s.date, s.time)}</td>
                      <td className="px-5 py-3 text-zinc-500">{s.note || '—'}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setModalSession(s);
                              setShowAdd(true);
                            }}
                            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all"
                            title="Edit"
                            aria-label={`Edit upcoming session ${formatDate(s.date, s.time)}`}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(s.id)}
                            className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Delete"
                            aria-label={`Delete upcoming session ${formatDate(s.date, s.time)}`}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* About */}
        <div className="border-t border-zinc-200 pt-10">
          <h3 className="text-lg font-bold text-zinc-900 tracking-tight mb-3">About</h3>
          <div className="bg-white border border-zinc-200/60 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
              GL
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">Gabriel Liu</p>
              <a
                href="https://github.com/flying3615"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                github.com/flying3615
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Modal */}
        {showAdd && (
          <SessionModal
            session={modalSession}
            onClose={() => {
              setShowAdd(false);
              setModalSession(null);
            }}
            onSaved={() => {
              setShowAdd(false);
              setModalSession(null);
              refreshUpcoming();
            }}
          />
        )}
      </div>
    </div>
    {showHistoricalDataCleanup && (
      <HistoricalDataCleanupDialog
        onClose={closeHistoricalDataCleanup}
        onSuccess={handleHistoricalDataCleanupSuccess}
      />
    )}
    </>
  );
}
