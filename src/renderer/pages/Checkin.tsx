import { useEffect, useState, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { levelColors, genderColors } from '../theme';

interface PlayerInfo {
  id: string;
  name: string;
  gender: string;
  level: number;
  balance: number;
  phone: string;
}

interface AttendanceInfo {
  id: string;
  playerId: string;
  sessionId: string;
  checkinTime: string;
  name: string;
  gender: string;
  level: number;
  paused: number;
}

interface GameInfo {
  id: string;
  courtNumber: number;
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  status: 'pending' | 'playing' | 'completed';
}

interface SessionInfo {
  id: string;
  date: string;
  startTime: string | null;
  status: 'active' | 'completed';
}

// ── Context Menu ──
function ContextMenu({
  x, y, player, onClose, onEdit, onDelete,
}: {
  x: number; y: number; player: PlayerInfo;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  const isMale = player.gender === 'male';

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[180px] bg-white border border-zinc-200 rounded-xl py-1 select-none"
      style={{
        left: Math.min(x, window.innerWidth - 190),
        top: Math.min(y, window.innerHeight - 120),
        boxShadow: '0 12px 32px -12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04)',
        animation: 'ctxFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div className="px-3 py-2 border-b border-zinc-100 flex items-center gap-2">
        <span
          className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0"
          style={{ backgroundColor: isMale ? genderColors.male.accent : genderColors.female.accent }}
        >
          {player.name[0]}
        </span>
        <span className="text-sm font-semibold text-zinc-800 truncate">{player.name}</span>
      </div>
      <button
        onClick={onEdit}
        className="w-full text-left px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2.5 transition-colors"
      >
        <svg className="w-4 h-4 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
        </svg>
        Edit Player
      </button>
      <button
        onClick={onDelete}
        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
      >
        <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0115.916 21H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
        Delete Player
      </button>
    </div>
  );
}

// ── Edit Player Modal ──
function EditPlayerModal({
  player, onClose, onSaved,
}: {
  player: PlayerInfo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(player.name);
  const [gender, setGender] = useState(player.gender);
  const [level, setLevel] = useState(player.level);
  const [phone, setPhone] = useState(player.phone);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.api.playersUpdate(player.id, { name, gender, level, phone });
      onSaved();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save player');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const isMale = gender === 'male';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl p-6 w-[400px] max-w-[90vw]"
        style={{
          boxShadow: '0 24px 48px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.04)',
          animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <h3 className="text-lg font-bold text-zinc-900 tracking-tight mb-5">Edit Player</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Gender</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setGender('male')}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-all active:scale-95 ${
                    isMale
                      ? 'bg-zinc-800 border-zinc-900 text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]'
                      : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                  }`}
                >
                  Male
                </button>
                <button
                  onClick={() => setGender('female')}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-all active:scale-95 ${
                    !isMale
                      ? 'bg-zinc-800 border-zinc-900 text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]'
                      : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                  }`}
                >
                  Female
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Level</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(l => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={`flex-1 py-2 text-sm font-bold rounded-xl border transition-all active:scale-95 ${
                      level === l
                        ? 'bg-zinc-800 border-zinc-900 text-white'
                        : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all"
              placeholder="Phone number"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-5 py-2 text-sm font-semibold bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 active:scale-[0.97] transition-all disabled:opacity-40 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2)]"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Player Modal ──
function AddPlayerModal({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (player: PlayerInfo, checkIn: boolean) => void | Promise<void>;
}) {
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [level, setLevel] = useState(3);
  const [phone, setPhone] = useState('');
  const [savingAction, setSavingAction] = useState<'add' | 'checkin' | null>(null);

  const fullName = [firstName.trim(), surname.trim()].filter(Boolean).join(' ');

  const handleCreate = async (checkIn: boolean) => {
    if (!fullName || savingAction) return;
    setSavingAction(checkIn ? 'checkin' : 'add');
    try {
      const created = await window.api.playersCreate({ name: fullName, gender, level, phone }) as PlayerInfo;
      await onCreated(created, checkIn);
      onClose();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add player');
    } finally {
      setSavingAction(null);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl p-6 w-[420px] max-w-[90vw]"
        style={{
          boxShadow: '0 24px 48px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.04)',
          animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <h3 className="text-lg font-bold text-zinc-900 tracking-tight mb-5">Add Player</h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">First Name</span>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Surname</span>
              <input
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Gender</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setGender('male')}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-all active:scale-95 ${
                    gender === 'male'
                      ? 'bg-zinc-800 border-zinc-900 text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]'
                      : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                  }`}
                >
                  Male
                </button>
                <button
                  onClick={() => setGender('female')}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-all active:scale-95 ${
                    gender === 'female'
                      ? 'bg-zinc-800 border-zinc-900 text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]'
                      : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                  }`}
                >
                  Female
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Level</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(l => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={`flex-1 py-2 text-sm font-bold rounded-xl border transition-all active:scale-95 ${
                      level === l
                        ? 'bg-zinc-800 border-zinc-900 text-white'
                        : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Phone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-gray-100 transition-all"
              placeholder="Phone number"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => handleCreate(false)}
            disabled={savingAction !== null || !fullName}
            className="px-4 py-2 text-sm font-semibold border border-zinc-200 text-zinc-700 rounded-xl hover:bg-zinc-50 active:scale-[0.97] transition-all disabled:opacity-40"
          >
            {savingAction === 'add' ? 'Adding...' : 'Add'}
          </button>
          <button
            onClick={() => handleCreate(true)}
            disabled={savingAction !== null || !fullName}
            className="px-5 py-2 text-sm font-semibold bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 active:scale-[0.97] transition-all disabled:opacity-40 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2)]"
          >
            {savingAction === 'checkin' ? 'Checking in...' : 'Add & Check in'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Checkin() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const removingRef = useRef(new Set<string>());
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [attendance, setAttendance] = useState<AttendanceInfo[]>([]);
  const [games, setGames] = useState<GameInfo[]>([]);
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<'gender' | 'level'>('gender');
  const [checkedInSet, setCheckedInSet] = useState<Set<string>>(new Set());
  const [sessionFee, setSessionFee] = useState('10');
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [lastSessionPlayers, setLastSessionPlayers] = useState<PlayerInfo[]>([]);

  const load = async () => {
    if (!sessionId) return;
    const [allPlayers, attendList, gameList, settings, sessionList] = await Promise.all([
      window.api.playersList(),
      window.api.attendanceListBySession(sessionId),
      window.api.gamesListBySession(sessionId),
      window.api.settingsGetAll() as Promise<Record<string, string>>,
      window.api.sessionsList(),
    ]);
    const typedPlayers = allPlayers as PlayerInfo[];
    const typedSessions = sessionList as SessionInfo[];
    const playerById = new Map(typedPlayers.map(p => [p.id, p]));
    const previousSession = typedSessions
      .filter(s => s.id !== sessionId && s.status === 'completed')
      .sort((a, b) => new Date(b.startTime ?? b.date).getTime() - new Date(a.startTime ?? a.date).getTime())[0];
    const previousAttendance = previousSession
      ? await window.api.attendanceListBySession(previousSession.id) as AttendanceInfo[]
      : [];
    const previousPlayers = previousAttendance
      .map(a => playerById.get(a.playerId))
      .filter((p): p is PlayerInfo => Boolean(p));
    previousPlayers.sort((a, b) => b.level - a.level);

    setPlayers(typedPlayers);
    setAttendance(attendList as AttendanceInfo[]);
    setGames(gameList as GameInfo[]);
    setCheckedInSet(new Set((attendList as AttendanceInfo[]).map(a => a.playerId)));
    setSessionFee(settings.sessionFee ?? '10');
    setLastSessionPlayers(previousPlayers);
  };

  useEffect(() => { load(); }, [sessionId]);

  const handleUncheck = async (playerId: string, playerName: string) => {
    if (removingRef.current.has(playerId)) return;
    const att = attendance.find(a => a.playerId === playerId);
    if (!att) return;
    removingRef.current.add(playerId);
    try {
      await window.api.attendanceRemove(att.id);
      setCheckedInSet(prev => {
        const next = new Set(prev);
        next.delete(playerId);
        return next;
      });
      load();
    } finally {
      removingRef.current.delete(playerId);
    }
  };

  // Context menu & edit state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; player: PlayerInfo } | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<PlayerInfo | null>(null);

  const handleContextMenu = (e: React.MouseEvent, p: PlayerInfo) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, player: p });
  };

  const handleEdit = () => {
    if (!ctxMenu) return;
    setEditingPlayer(ctxMenu.player);
    setCtxMenu(null);
  };

  const handleDeletePlayer = async () => {
    if (!ctxMenu) return;
    const player = ctxMenu.player;
    const ok = window.confirm(`Delete ${player.name}? This will remove their check-ins and payment history.`);
    if (!ok) return;

    await window.api.playersDelete(player.id);
    setCtxMenu(null);
    setCheckedInSet(prev => {
      const next = new Set(prev);
      next.delete(player.id);
      return next;
    });
    await load();
  };

  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Waiting pool ──
  const inGameIds = new Set(
    games.filter(g => g.status === 'playing' || g.status === 'pending').flatMap(g => [
      g.team1Player1Id, g.team1Player2Id, g.team2Player1Id, g.team2Player2Id,
    ])
  );
  const waitingPlayers = attendance.filter(a => !inGameIds.has(a.playerId) && a.paused !== 1);
  const pausedPlayers = attendance.filter(a => a.paused === 1 && !inGameIds.has(a.playerId));
  const maleWaiting = waitingPlayers.filter(p => p.gender === 'male');
  const femaleWaiting = waitingPlayers.filter(p => p.gender === 'female');

  const fee = Number(sessionFee) || 10;
  const lastSessionQuickPlayers = lastSessionPlayers.filter(p => !checkedInSet.has(p.id));

  const doCheckin = async (playerId: string, playerName: string, method: 'credit' | 'cash') => {
    if (!sessionId) return;
    try {
      await window.api.attendanceCheckin(playerId, sessionId, method);
      setCheckedInSet(prev => new Set(prev).add(playerId));
      load();
    } catch (err: any) {
      alert(err?.message ?? 'Check-in failed');
    }
  };

  const handlePlayerCreated = async (player: PlayerInfo, checkIn: boolean) => {
    if (checkIn) {
      await doCheckin(player.id, player.name, 'cash');
    } else {
      await load();
    }
  };

  const renderCard = (p: PlayerInfo) => {
    const checked = checkedInSet.has(p.id);
    const isMale = p.gender === 'male';
    const canCredit = p.balance >= fee;

    if (checked) {
      return (
        <button
          key={p.id}
          onClick={() => handleUncheck(p.id, p.name)}
          onContextMenu={(e) => handleContextMenu(e, p)}
          className="relative flex items-center rounded-md text-left transition-all active:scale-[0.98] group/check"
          style={{
            padding: '3px 6px',
            backgroundColor: '#ecfdf5',
            borderColor: '#a7f3d0',
            borderWidth: 1,
            borderStyle: 'solid',
            boxShadow: '0 1px 3px -2px rgba(16,185,129,0.12)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#fee2e2';
            e.currentTarget.style.borderColor = '#fecaca';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#ecfdf5';
            e.currentTarget.style.borderColor = '#a7f3d0';
          }}
        >
          <span className="text-sm font-bold truncate flex-1" style={{ color: '#047857' }}>
            {p.name}
            <span className="text-[11px] text-zinc-400 ml-0.5">{p.level}</span>
          </span>
          <span className="shrink-0 ml-0.5">
            <svg className="w-3 h-3 text-emerald-500 block group-hover/check:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <svg className="w-3 h-3 text-red-400 hidden group-hover/check:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        </button>
      );
    }

    return (
      <div
        key={p.id}
        onContextMenu={(e) => handleContextMenu(e, p)}
        onDoubleClick={() => doCheckin(p.id, p.name, 'cash')}
        className="flex items-center rounded-md transition-all"
        style={{
          padding: '2px 4px',
          backgroundColor: isMale ? '#eef4ff' : '#fdf2f8',
          borderColor: isMale ? '#bfdbfe' : '#f0c5dd',
          borderWidth: 1,
          borderStyle: 'solid',
          cursor: 'pointer',
        }}
      >
        <span className="text-sm font-bold truncate flex-1" style={{ color: levelColors[p.level] ?? '#6b7280' }}>
          {p.name}
          <span className="text-[11px] text-zinc-400 ml-0.5">{p.level}</span>
        </span>
        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          <button
            onClick={() => doCheckin(p.id, p.name, 'credit')}
            disabled={!canCredit}
            className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Cr
          </button>
          <button
            onClick={() => doCheckin(p.id, p.name, 'cash')}
            className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95 transition-all"
          >
            $
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 flex">
      <style>{`
        @keyframes ctxFadeIn {
          from { opacity: 0; transform: scale(0.95) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          player={ctxMenu.player}
          onClose={() => setCtxMenu(null)}
          onEdit={handleEdit}
          onDelete={handleDeletePlayer}
        />
      )}

      {/* Edit Player Modal */}
      {editingPlayer && (
        <EditPlayerModal
          player={editingPlayer}
          onClose={() => setEditingPlayer(null)}
          onSaved={() => { setEditingPlayer(null); load(); }}
        />
      )}

      {showAddPlayer && (
        <AddPlayerModal
          onClose={() => setShowAddPlayer(false)}
          onCreated={handlePlayerCreated}
        />
      )}

      {/* === LEFT: Check-in Grid === */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 py-3">
          {/* Top bar */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm text-zinc-500 shrink-0">
              Checked in <strong className="text-emerald-600">{checkedInSet.size}</strong> / <strong className="text-zinc-700">{players.length}</strong>
            </span>
            {/* Group toggles */}
            <div className="flex rounded-lg border border-zinc-200 overflow-hidden shrink-0">
              <button
                onClick={() => setGroupBy('gender')}
                className="text-xs font-medium px-2.5 py-1 transition-colors"
                style={{
                  backgroundColor: groupBy === 'gender' ? '#f4f4f5' : '#fff',
                  color: groupBy === 'gender' ? '#18181b' : '#a1a1aa',
                }}
              >
                By Gender
              </button>
              <button
                onClick={() => setGroupBy('level')}
                className="text-xs font-medium px-2.5 py-1 border-l border-zinc-200 transition-colors"
                style={{
                  backgroundColor: groupBy === 'level' ? '#f4f4f5' : '#fff',
                  color: groupBy === 'level' ? '#18181b' : '#a1a1aa',
                }}
              >
                By Level
              </button>
            </div>
            <Link
              to={`/match/${sessionId}`}
              className="text-xs font-semibold px-3 py-1.5 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 active:scale-[0.97] transition-all shrink-0"
            >
              Match Panel
            </Link>
            <button
              onClick={() => setShowAddPlayer(true)}
              className="text-xs font-semibold px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 active:scale-[0.97] transition-all shrink-0"
            >
              Add Player
            </button>
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search player name..."
                className="w-full pl-7 pr-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                autoFocus
              />
            </div>
          </div>

          {lastSessionQuickPlayers.length > 0 && (
            <section
              aria-label="Last session quick check-in"
              className="mb-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Last Session</span>
                <span className="text-[11px] text-amber-700/70">
                  {lastSessionQuickPlayers.length} returning
                </span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1">
                {lastSessionQuickPlayers.map(p => renderCard(p))}
              </div>
            </section>
          )}

          {/* Player grid — grouped */}
          {groupBy === 'gender' ? (
            <>
              {[
                { label: 'M', icon: genderColors.male.border, players: filtered.filter(p => p.gender === 'male') },
                { label: 'F', icon: genderColors.female.border, players: filtered.filter(p => p.gender === 'female') },
              ].map(group => (
                <div key={group.label} className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.icon }} />
                    <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                      {group.label} ({group.players.length})
                    </span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1">
                    {group.players.map(p => renderCard(p))}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              {[5, 4, 3, 2, 1].map(lv => {
                const group = filtered.filter(p => p.level === lv);
                if (group.length === 0) return null;
                return (
                  <div key={lv} className="mb-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: levelColors[lv] }} />
                      <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                        Lv {lv} ({group.length})
                      </span>
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1">
                      {group.map(p => renderCard(p))}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {filtered.length === 0 && search && (
            <p className="text-center text-zinc-400 py-10 text-xs">No matching players</p>
          )}
        </div>
      </div>

      {/* === RIGHT: Waiting Pool Sidebar === */}
      <aside className="w-60 bg-white border-l border-zinc-200 flex flex-col shrink-0"
        style={{ boxShadow: '-4px 0 20px -12px rgba(0,0,0,0.06)' }}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <h3 className="text-xs font-bold text-zinc-700 tracking-tight">Waiting Pool</h3>
            <span className="ml-auto text-[11px] text-zinc-400 font-medium tabular-nums">{waitingPlayers.length} players</span>
          </div>
        </div>

        {/* Gender summary */}
        <div className="px-4 py-2 border-b border-zinc-100 flex gap-3 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: genderColors.male.border }} />
            <span className="text-zinc-500">M <strong className="text-zinc-700">{maleWaiting.length}</strong></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: genderColors.female.border }} />
            <span className="text-zinc-500">F <strong className="text-zinc-700">{femaleWaiting.length}</strong></span>
          </span>
        </div>

        {/* Player list */}
        <div className="flex-1 overflow-auto px-2 py-2 space-y-1">
          {waitingPlayers.length === 0 && pausedPlayers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-zinc-400">
              <svg className="w-10 h-10 mb-2 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <p className="text-[11px] font-medium">No players waiting</p>
            </div>
          ) : (
            <>
              {waitingPlayers.map((p, i) => (
                <div
                  key={p.playerId}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left"
                  style={{
                    backgroundColor: p.gender === 'male' ? '#eef4ff' : '#fdf2f8',
                    borderColor: p.gender === 'male' ? '#bfdbfe' : '#f0c5dd',
                    animation: `fadeSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) ${i * 50}ms forwards`,
                    opacity: 0,
                  }}
                >
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{
                      backgroundColor: p.gender === 'male' ? genderColors.male.accent : genderColors.female.accent,
                      boxShadow: p.gender === 'male' ? '0 2px 4px rgba(59,130,246,0.3)' : '0 2px 4px rgba(236,72,153,0.3)',
                    }}
                  >
                    {p.name[0]}
                  </span>
                  <span className="flex-1 text-xs font-semibold text-zinc-800 truncate">{p.name}</span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={{
                      backgroundColor: levelColors[p.level] ? levelColors[p.level] + '18' : '#f3f4f6',
                      color: levelColors[p.level] ?? '#9ca3af',
                    }}
                  >
                    {p.level}
                  </span>
                </div>
              ))}
              {pausedPlayers.map((p, i) => (
                <div
                  key={p.playerId}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left opacity-50"
                  style={{
                    backgroundColor: '#f5f5f4',
                    borderColor: '#e7e5e4',
                    animation: `fadeSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) ${(waitingPlayers.length + i) * 50}ms forwards`,
                    opacity: 0,
                  }}
                >
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: '#a8a29e' }}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                    </svg>
                  </span>
                  <span className="flex-1 text-xs font-semibold text-zinc-400 truncate">{p.name}</span>
                  <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">Paused</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-zinc-100 text-[11px] text-zinc-400 flex items-center justify-between">
          <span>{attendance.length} checked in</span>
          <span>{inGameIds.size} playing</span>
        </div>
      </aside>
    </div>
  );
}
