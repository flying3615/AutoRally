import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { generateMatches } from '../services/matching';
import { useGameContext } from '../contexts/GameContext';
import { levelColors, genderColors } from '../theme';
import type { Game } from '../../shared/types';

interface GameInfo {
  id: string;
  sessionId: string;
  courtNumber: number;
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  status: 'pending' | 'playing' | 'completed';
  roundNumber: number;
  gameType: Game['gameType'];
  startedAt: string | null;
  endedAt: string | null;
  t1p1Name: string; t1p1Gender: string; t1p1Level: number;
  t1p2Name: string; t1p2Gender: string; t1p2Level: number;
  t2p1Name: string; t2p1Gender: string; t2p1Level: number;
  t2p2Name: string; t2p2Gender: string; t2p2Level: number;
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

interface PlayerInfo {
  id: string;
  name: string;
  gender: string;
  level: number;
  phone: string;
}

interface Settings {
  gameDuration: string;
  courtCount: string;
}

interface ContextMenuTarget {
  attendanceId: string;
  playerId: string;
  name: string;
  gender: string;
  level: number;
  phone: string;
  paused: boolean;
  checkedOut: boolean;
}

// ── Context Menu ──
function ContextMenu({
  x, y, target, onClose,
  onEdit, onTogglePause, onCheckout, onRestoreCheckin,
}: {
  x: number; y: number; target: ContextMenuTarget;
  onClose: () => void;
  onEdit: (target: ContextMenuTarget) => void;
  onTogglePause: (target: ContextMenuTarget) => void;
  onCheckout: (target: ContextMenuTarget) => void;
  onRestoreCheckin: (target: ContextMenuTarget) => void;
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

  const isMale = target.gender === 'male';

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[200px] bg-white border border-zinc-200 rounded-xl shadow-2xl py-1 select-none"
      style={{
        left: Math.min(x, window.innerWidth - 210),
        top: Math.min(y, window.innerHeight - 200),
        boxShadow: '0 16px 40px -16px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04)',
        animation: 'ctxFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div className="px-3 py-2 border-b border-zinc-100 flex items-center gap-2">
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
          style={{ backgroundColor: target.checkedOut ? '#ef4444' : isMale ? genderColors.male.accent : genderColors.female.accent }}
        >
          {target.name[0]}
        </span>
        <span className="text-sm font-semibold text-zinc-800 truncate">{target.name}</span>
        {target.checkedOut && (
          <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-px rounded-full ml-auto shrink-0">Left</span>
        )}
      </div>

      <button
        onClick={() => onEdit(target)}
        className="w-full text-left px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2.5 transition-colors"
      >
        <svg className="w-4 h-4 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
        </svg>
        Edit Player
      </button>

      {!target.checkedOut && (
        <button
          onClick={() => onTogglePause(target)}
          className="w-full text-left px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2.5 transition-colors"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
            style={{ color: target.paused ? '#059669' : '#d97706' }}>
            {target.paused ? (
              <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.75v10.5m-4.5-10.5v10.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.75L9.75 12l4.5 5.25" />
              </>
            ) : (
              <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.75v10.5m-4.5-10.5v10.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 6.75v10.5" />
              </>
            )}
          </svg>
          {target.paused ? 'Resume Scheduling' : 'Pause Scheduling'}
        </button>
      )}

      {target.checkedOut ? (
        <button
          onClick={() => onRestoreCheckin(target)}
          className="w-full text-left px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 flex items-center gap-2.5 transition-colors"
        >
          <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
          Restore Check-in
        </button>
      ) : (
        <button
          onClick={() => onCheckout(target)}
          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
        >
          <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
          Check Out Early
        </button>
      )}
    </div>
  );
}

// ── Edit Player Modal ──
function EditPlayerModal({
  player, onClose, onSaved,
}: {
  player: { playerId: string; name: string; gender: string; level: number; phone: string };
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
    await window.api.playersUpdate(player.playerId, { name, gender, level, phone });
    setSaving(false);
    onSaved();
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
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Gender</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setGender('male')}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-all active:scale-95 ${
                    gender === 'male'
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                  }`}
                >
                  Male
                </button>
                <button
                  onClick={() => setGender('female')}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-all active:scale-95 ${
                    gender === 'female'
                      ? 'bg-pink-50 border-pink-300 text-pink-700'
                      : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                  }`}
                >
                  Female
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Level (1-5)</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(l => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={`flex-1 py-2 text-sm font-bold rounded-xl border transition-all active:scale-95 ${
                      level === l
                        ? 'bg-zinc-900 border-zinc-900 text-white'
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
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              placeholder="Phone number"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-5 py-2 text-sm font-semibold bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 active:scale-[0.97] transition-all disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Player Tag (game card) ──
// ── Drop Slot wrapper for pending game cards ──
function DropSlot({
  gameId, slot, playerId, onDropPlayer, children,
}: {
  gameId: string;
  slot: string;
  playerId: string;
  onDropPlayer: (gameId: string, slot: string, newPlayerId: string, sourceData?: string) => void;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);

  return (
    <div
      draggable
      className="rounded-lg cursor-grab w-full h-full flex items-center justify-center"
      style={{
        backgroundColor: over ? 'rgba(59,130,246,0.06)' : 'transparent',
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-player-id', playerId);
        e.dataTransfer.setData('application/x-source', `${gameId}:${slot}`);
        e.dataTransfer.setData('text/plain', playerId);
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.style.opacity = '0.4';
      }}
      onDragEnd={(e) => { e.currentTarget.style.opacity = ''; }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const draggedId = e.dataTransfer.getData('application/x-player-id') || e.dataTransfer.getData('text/plain');
        const source = e.dataTransfer.getData('application/x-source');
        if (draggedId) onDropPlayer(gameId, slot, draggedId, source || undefined);
      }}
    >
      {children}
    </div>
  );
}

function PlayerTag({
  name, gender, level, playerId, onContextMenu,
  paused = false,
  checkedOut = false,
}: {
  name: string; gender: string; level: number; playerId: string;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  paused?: boolean;
  checkedOut?: boolean;
}) {
  const isMale = gender === 'male';
  const gc = isMale ? genderColors.male : genderColors.female;
  const textClr = levelColors[level] ?? levelColors[3]!;

  return (
    <div
      className="inline-flex items-center justify-center w-full h-full px-2 py-5 rounded-xl select-none relative min-w-0 overflow-hidden"
      style={{
        backgroundColor: paused ? '#f5f5f4' : checkedOut ? '#fef2f2' : gc.bg,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: paused ? '#d6d3d1' : checkedOut ? '#fecaca' : gc.border,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        cursor: 'context-menu',
      }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, playerId); }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.04)';
        e.currentTarget.style.boxShadow = `0 3px 10px -3px ${gc.border}60`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <span
        className="text-3xl font-bold tracking-tight truncate"
        style={{ color: paused ? '#a8a29e' : checkedOut ? '#ef4444' : textClr }}
      >
        {name}
        <span className="text-lg font-semibold opacity-60 ml-0.5">({level})</span>
      </span>
      {(paused || checkedOut) && (
        <span
          className="text-[10px] font-semibold px-1.5 py-px rounded-full ml-2 shrink-0"
          style={{
            backgroundColor: checkedOut ? '#fef2f2' : '#fef9c3',
            color: checkedOut ? '#dc2626' : '#a16207',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: checkedOut ? '#fecaca' : '#fde68a',
          }}
        >
          {checkedOut ? 'Left' : 'Paused'}
        </span>
      )}
    </div>
  );
}

// ── Player Card (waiting pool) ──
function PlayerCard({
  p, index, onContextMenu,
}: {
  p: AttendanceInfo; index: number;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}) {
  const isMale = p.gender === 'male';
  const isPaused = p.paused === 1;

  return (
    <div
      draggable={!isPaused}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-player-id', p.playerId);
        e.dataTransfer.setData('text/plain', p.playerId);
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.style.opacity = '0.4';
      }}
      onDragEnd={(e) => {
        e.currentTarget.style.opacity = '';
      }}
      className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg select-none"
      style={{
        backgroundColor: isPaused ? '#f5f5f4' : isMale ? genderColors.male.bg : genderColors.female.bg,
        animation: `fadeSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) ${index * 40}ms forwards`,
        transition: 'background-color 0.15s ease, opacity 0.15s ease',
        cursor: isPaused ? 'context-menu' : 'grab',
        opacity: 0,
      }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, p.playerId); }}
      onMouseEnter={(e) => {
        if (isPaused) return;
        e.currentTarget.style.backgroundColor = isMale ? genderColors.male.border : genderColors.female.border;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isPaused ? '#f5f5f4' : isMale ? genderColors.male.bg : genderColors.female.bg;
      }}
    >
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 text-white"
        style={{
          backgroundColor: isPaused ? '#a8a29e' : isMale ? genderColors.male.accent : genderColors.female.accent,
        }}
      >
        {isPaused ? (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
          </svg>
        ) : (
          p.name[0]
        )}
      </div>

      <span className="flex-1 text-sm font-medium text-zinc-800 truncate">{p.name}</span>

      {isPaused ? (
        <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-amber-100 text-amber-700 shrink-0">Paused</span>
      ) : (
        <span className="text-[10px] font-semibold shrink-0" style={{ color: isMale ? genderColors.male.accent : genderColors.female.accent }}>
          {isMale ? '♂' : '♀'}{p.level}
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// Main MatchPanel Component
// ═══════════════════════════════════════════
export function MatchPanel() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [attendance, setAttendance] = useState<AttendanceInfo[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerInfo[]>([]);
  const [settings, setSettings] = useState<Settings>({ gameDuration: '15', courtCount: '3' });
  const [checkinSearch, setCheckinSearch] = useState('');
  const [poolWidth, setPoolWidth] = useState(288);
  const isDragging = useRef(false);
  const [checkinFeedback, setCheckinFeedback] = useState<string | null>(null);
  const { timers, startGame, pauseGame, resumeGame, earlyFinishGame } = useGameContext();
  const nextRoundGeneratedRef = useRef(false);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; target: ContextMenuTarget } | null>(null);

  // Edit modal state
  const [editTarget, setEditTarget] = useState<{
    playerId: string; name: string; gender: string; level: number; phone: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const [gameList, attendList, playerList, allSettings] = await Promise.all([
      window.api.gamesListBySession(sessionId),
      window.api.attendanceListBySession(sessionId),
      window.api.playersList(),
      window.api.settingsGetAll(),
    ]);
    setGames(gameList as GameInfo[]);
    setAttendance(attendList as AttendanceInfo[]);
    setAllPlayers(playerList as PlayerInfo[]);
    setSettings(allSettings as Settings);
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const activeGames = games.filter(g => g.status === 'playing');
  const pendingGames = games.filter(g => g.status === 'pending');
  const currentRound = games.length > 0 ? Math.max(...games.map(g => g.roundNumber)) : 0;

  const playingIds = new Set(
    activeGames.flatMap(g => [g.team1Player1Id, g.team1Player2Id, g.team2Player1Id, g.team2Player2Id])
  );
  const pendingIds = new Set(
    pendingGames.flatMap(g => [g.team1Player1Id, g.team1Player2Id, g.team2Player1Id, g.team2Player2Id])
  );
  const inGameIds = new Set([...playingIds, ...pendingIds]);

  // Player status indicators for game cards
  const attendedIds = new Set(attendance.map(a => a.playerId));
  const pausedPlayerIds = new Set(attendance.filter(a => a.paused === 1).map(a => a.playerId));
  // A player in a game but not in attendance = checked out early
  const checkedOutPlayerIds = new Set(
    [...inGameIds].filter(id => !attendedIds.has(id))
  );

  // ── Context menu handlers ──
  const buildContextTarget = (playerId: string): ContextMenuTarget | null => {
    const a = attendance.find(att => att.playerId === playerId);
    if (a) {
      const match = (attendance as unknown as (AttendanceInfo & { phone: string })[]).find(att => att.playerId === playerId);
      return {
        attendanceId: a.id,
        playerId: a.playerId,
        name: a.name,
        gender: a.gender,
        level: a.level,
        phone: (match as unknown as { phone?: string })?.phone ?? '',
        paused: a.paused === 1,
        checkedOut: false,
      };
    }
    // Player is checked out — still in a game but no longer in attendance
    if (checkedOutPlayerIds.has(playerId)) {
      const p = allPlayers.find(pl => pl.id === playerId);
      if (!p) return null;
      return {
        attendanceId: '',
        playerId: p.id,
        name: p.name,
        gender: p.gender,
        level: p.level,
        phone: p.phone,
        paused: false,
        checkedOut: true,
      };
    }
    return null;
  };

  const handlePlayerContextMenu = (e: React.MouseEvent, playerId: string) => {
    const target = buildContextTarget(playerId);
    if (!target) return;
    setCtxMenu({ x: e.clientX, y: e.clientY, target });
  };

  const handleEdit = (target: ContextMenuTarget) => {
    setCtxMenu(null);
    setEditTarget({
      playerId: target.playerId,
      name: target.name,
      gender: target.gender,
      level: target.level,
      phone: target.phone,
    });
  };

  const handleTogglePause = async (target: ContextMenuTarget) => {
    const newPaused = !target.paused;
    await window.api.attendanceSetPaused(target.attendanceId, newPaused);
    setCtxMenu(null);
    load();
  };

  const handleCheckout = async (target: ContextMenuTarget) => {
    await window.api.attendanceRemove(target.attendanceId);
    setCtxMenu(null);
    load();
  };

  const handleRestoreCheckin = async (target: ContextMenuTarget) => {
    if (!sessionId) return;
    await window.api.attendanceCheckin(target.playerId, sessionId, 'cash');
    setCtxMenu(null);
    load();
  };

  const handleEditSaved = () => {
    setEditTarget(null);
    load();
  };

  const handleDropPlayer = async (targetGameId: string, targetSlot: string, draggedPlayerId: string, sourceData?: string) => {
    try {
      // If dragged from another game slot, swap: put target player into source slot
      if (sourceData) {
        const [srcGameId, srcSlot] = sourceData.split(':');
        if (!srcGameId || !srcSlot) return;
        // Find the player currently in the target slot
        const allGames = await window.api.gamesListBySession(sessionId!) as GameInfo[];
        const targetGame = allGames.find(g => g.id === targetGameId);
        if (targetGame) {
          const slotToPlayer: Record<string, string> = {
            team1Player1Id: targetGame.team1Player1Id,
            team1Player2Id: targetGame.team1Player2Id,
            team2Player1Id: targetGame.team2Player1Id,
            team2Player2Id: targetGame.team2Player2Id,
          };
          const targetPlayerId = slotToPlayer[targetSlot];
          if (!targetPlayerId) return;
          // Don't swap if dropping onto self
          if (targetPlayerId === draggedPlayerId) return;
          // Put dragged player into target slot
          await window.api.gamesReplacePlayer(targetGameId, targetSlot, draggedPlayerId);
          // Put target player into source slot
          await window.api.gamesReplacePlayer(srcGameId, srcSlot, targetPlayerId);
        }
      } else {
        // From waiting pool — just replace
        await window.api.gamesReplacePlayer(targetGameId, targetSlot, draggedPlayerId);
      }
    } catch (err) {
      console.error('Replace player failed:', err);
    }
    await load();
  };

  // ── Checkin via search ──
  const searchResults = checkinSearch.trim()
    ? allPlayers.filter(p => !attendedIds.has(p.id) && p.name.toLowerCase().includes(checkinSearch.toLowerCase()))
    : [];

  const handleCheckin = async (playerId: string, playerName: string) => {
    if (!sessionId) return;
    await window.api.attendanceCheckin(playerId, sessionId, 'cash');
    setCheckinFeedback(playerName);
    setCheckinSearch('');
    setTimeout(() => setCheckinFeedback(null), 2000);
    load();
  };

  // ── Game handlers ──
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startWidth = poolWidth;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    const handleMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX - ev.clientX;
      setPoolWidth(Math.max(200, Math.min(480, startWidth + delta)));
    };
    const handleUp = () => {
      isDragging.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };

  const handleGenerate = async () => {
    if (!sessionId) return;

    try {
      // Fetch fresh pending games from DB and clear them before generating new ones
      const freshGames = await window.api.gamesListBySession(sessionId) as GameInfo[];
      for (const g of freshGames) {
        if (g.status === 'pending') {
          await window.api.gamesDelete(g.id);
        }
      }

      const maxRound = await window.api.gamesMaxRound(sessionId) as number;
      const nextRound = maxRound + 1;

      // Build pool from waiting players (exclude only active-game players; pending games were just cleared)
      const courtCount = Number(settings.courtCount) || 3;
      const waitingAvailable = attendance.filter(a => !playingIds.has(a.playerId) && a.paused !== 1);

      let pool = waitingAvailable.map(a => ({
        id: a.playerId,
        name: a.name,
        gender: a.gender as 'male' | 'female',
        level: a.level,
        checkinTime: a.checkinTime,
      }));

      // If waiting pool is too small, also include players currently in active games
      if (pool.length < courtCount * 4) {
        const activePlayerIds = new Set(activeGames.flatMap(g => [g.team1Player1Id, g.team1Player2Id, g.team2Player1Id, g.team2Player2Id]));
        const activeAvailable = attendance.filter(a => activePlayerIds.has(a.playerId) && a.paused !== 1);
        const extra = activeAvailable.map(a => ({
          id: a.playerId,
          name: a.name,
          gender: a.gender as 'male' | 'female',
          level: a.level,
          checkinTime: a.checkinTime,
        }));
        pool = [...pool, ...extra];
      }

      const countedGames = freshGames.filter(g => g.status !== 'pending');
      const matches = generateMatches(pool, courtCount, nextRound, countedGames);

      if (matches.length === 0) {
        alert(`Not enough players to generate matches (waiting pool has ${pool.length} players, need at least ${courtCount * 4})`);
        return;
      }

      for (let i = 0; i < matches.length; i++) {
        const m = matches[i]!;
        await window.api.gamesCreate({
          sessionId,
          courtNumber: i + 1,
          team1Player1Id: m.team1[0],
          team1Player2Id: m.team1[1],
          team2Player1Id: m.team2[0],
          team2Player2Id: m.team2[1],
          roundNumber: nextRound,
          gameType: m.gameType,
        });
      }
      load();
    } catch (err: unknown) {
      alert('Failed to generate matches: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Auto-generate next round when timer hits warning (last 60s)
  useEffect(() => {
    if (nextRoundGeneratedRef.current) return;
    if (activeGames.length === 0) return;
    const hasWarning = activeGames.some(g => timers.get(g.courtNumber)?.phase === 'warning');
    if (hasWarning) {
      handleGenerate();
      nextRoundGeneratedRef.current = true;
    }
  }, [timers, activeGames]);

  // Reset the generation flag when no more active games
  useEffect(() => {
    if (activeGames.length === 0) {
      nextRoundGeneratedRef.current = false;
    }
  }, [activeGames.length]);

  const handleStartRound = async () => {
    nextRoundGeneratedRef.current = false;
    const duration = Number(settings.gameDuration);
    for (const game of pendingGames) {
      await window.api.gamesStart(game.id);
      startGame(game.courtNumber, duration, () => {
        window.api.gamesComplete(game.id).then(() => load());
      });
    }
    load();
  };

  const handlePauseAll = () => {
    for (const g of activeGames) {
      pauseGame(g.courtNumber);
    }
  };

  const handleResumeAll = () => {
    for (const g of activeGames) {
      const timer = timers.get(g.courtNumber);
      if (timer?.phase === 'paused') resumeGame(g.courtNumber);
    }
  };

  const handleFinishAll = async () => {
    for (const g of activeGames) {
      earlyFinishGame(g.courtNumber);
      await window.api.gamesComplete(g.id);
    }
    load();
  };

  const anyPaused = activeGames.some(g => timers.get(g.courtNumber)?.phase === 'paused');

  // Central timer — use first active game's timer since all courts share same duration
  const masterTimer = activeGames.length > 0 ? timers.get(activeGames[0]!.courtNumber) : undefined;
  const isWarning = masterTimer?.phase === 'warning';

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Exclude paused players from waiting pool (they're displayed separately)
  const waitingPlayers = attendance.filter(a => !inGameIds.has(a.playerId) && a.paused !== 1);
  const pausedPlayers = attendance.filter(a => a.paused === 1 && !inGameIds.has(a.playerId));
  const maleWaiting = waitingPlayers.filter(p => p.gender === 'male');
  const femaleWaiting = waitingPlayers.filter(p => p.gender === 'female');

  return (
    <div className="absolute inset-0 flex">
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ctxFadeIn {
          from { opacity: 0; transform: scale(0.95) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          target={ctxMenu.target}
          onClose={() => setCtxMenu(null)}
          onEdit={handleEdit}
          onTogglePause={handleTogglePause}
          onCheckout={handleCheckout}
          onRestoreCheckin={handleRestoreCheckin}
        />
      )}

      {/* Edit Modal */}
      {editTarget && (
        <EditPlayerModal
          player={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={handleEditSaved}
        />
      )}

      {/* === LEFT: Match Area === */}
      <div className="flex-1 overflow-auto relative">
        <div className="p-4 min-h-full flex flex-col">
          {/* Compact Header */}
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight">Match Panel</h2>
              <span className="w-px h-4 bg-zinc-200" />
              <span className="text-xs text-zinc-500">
                Checked in <strong className="text-zinc-700">{attendance.length}</strong>
              </span>
              <span className="text-xs text-zinc-500">
                Waiting <strong className="text-zinc-700">{waitingPlayers.length}</strong>
              </span>
              <span className="text-xs text-zinc-500">
                Round <strong className="text-zinc-700">{currentRound}</strong>
              </span>
              {pausedPlayers.length > 0 && (
                <span className="text-xs text-amber-600">
                  Paused <strong>{pausedPlayers.length}</strong> players
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeGames.length === 0 && pendingGames.length === 0 && (
                <button
                  onClick={handleGenerate}
                  className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg
                    hover:bg-emerald-700 active:scale-[0.97] transition-transform"
                >
                  Generate Matches
                </button>
              )}
              {pendingGames.length > 0 && activeGames.length === 0 && !isWarning && (
                <button
                  onClick={handleStartRound}
                  className="px-5 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg
                    hover:bg-blue-700 active:scale-[0.97] transition-transform"
                  style={{ boxShadow: '0 4px 12px -4px rgba(37,99,235,0.4)' }}
                >
                  Start Round ({pendingGames.length} courts)
                </button>
              )}
            </div>
          </div>

          {/* Empty state — no games at all */}
          {activeGames.length === 0 && pendingGames.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-zinc-400">
              <svg className="w-16 h-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
              </svg>
              <p className="text-sm font-medium mb-1">No matches generated yet</p>
              <p className="text-xs opacity-60 ">
                {waitingPlayers.length} players in pool (M {maleWaiting.length} / F {femaleWaiting.length})
              </p>
            </div>
          )}

          {/* === Fixed Timer Overlay — pinned to top-center when games active === */}
          {activeGames.length > 0 && (
            <div
              className="fixed top-12 left-1/2 -translate-x-1/2 z-40 flex items-center gap-6 rounded-2xl border"
              style={{
                padding: '12px 32px',
                backgroundColor: masterTimer?.phase === 'paused' ? 'rgba(245,244,241,0.95)' : masterTimer?.phase === 'warning' ? 'rgba(255,251,235,0.95)' : 'rgba(240,253,244,0.95)',
                borderColor: masterTimer?.phase === 'paused' ? '#d6d3d1' : masterTimer?.phase === 'warning' ? '#fde68a' : '#bbf7d0',
                backdropFilter: 'blur(8px)',
                boxShadow: masterTimer?.phase === 'paused'
                  ? '0 8px 30px -8px rgba(120,113,108,0.2)'
                  : masterTimer?.phase === 'warning'
                    ? '0 8px 30px -8px rgba(234,179,8,0.35)'
                    : '0 8px 30px -8px rgba(34,197,94,0.25)',
                animation: 'ctxFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <div className="flex items-center gap-5">
                <span
                  className="font-mono font-bold tabular-nums tracking-tight leading-none"
                  style={{
                    fontSize: '64px',
                    color: masterTimer?.phase === 'warning' ? '#d97706' : masterTimer?.phase === 'paused' ? '#a16207' : '#16a34a',
                  }}
                >
                  {masterTimer ? formatTime(masterTimer.remaining) : `--:--`}
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: masterTimer?.phase === 'paused' ? '#a16207' : masterTimer?.phase === 'warning' ? '#d97706' : '#16a34a' }}>
                    {masterTimer?.phase === 'paused' ? 'Paused' : masterTimer?.phase === 'warning' ? 'Time Warning' : 'In Progress'}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {activeGames.length} courts
                    {pendingGames.length > 0 && ` · ${pendingGames.length} pending`}
                  </span>
                </div>
              </div>
              <div className="w-px h-8 bg-zinc-200" />
              <div className="flex items-center gap-2">
                {anyPaused ? (
                  <button
                    onClick={handleResumeAll}
                    className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg
                      hover:bg-emerald-700 active:scale-[0.97] transition-transform"
                  >
                    Resume All
                  </button>
                ) : (
                  <button
                    onClick={handlePauseAll}
                    className="px-4 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg
                      hover:bg-amber-600 active:scale-[0.97] transition-transform"
                  >
                    Pause All
                  </button>
                )}
                <button
                  onClick={handleFinishAll}
                  className="px-4 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg
                    hover:bg-red-600 active:scale-[0.97] transition-transform"
                >
                  End All
                </button>
              </div>
            </div>
          )}

          {/* Active Games */}
          {activeGames.length > 0 && (
            <div className="flex-1 min-h-0 mb-4 flex flex-col">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 shrink-0">In Progress</h3>
              <div className="grid grid-cols-2 gap-3 flex-1 min-h-0" style={{ gridTemplateRows: '1fr 1fr' }}>
                {activeGames.map(g => {
                  const timer = timers.get(g.courtNumber);
                  const isWarning = timer?.phase === 'warning';
                  const isEnded = timer?.phase === 'ended';
                  const isPaused = timer?.phase === 'paused';

                  return (
                    <div
                      key={g.id}
                      className="rounded-2xl border p-6 relative h-full flex items-center"
                      style={{
                        backgroundColor: isPaused ? '#f5f5f4' : isEnded ? '#fef2f2' : isWarning ? '#fffbeb' : '#f0fdf4',
                        borderColor: isPaused ? '#d6d3d1' : isEnded ? '#fecaca' : isWarning ? '#fde68a' : '#bbf7d0',
                        boxShadow: isPaused
                          ? '0 4px 20px -8px rgba(120,113,108,0.1)'
                          : isEnded
                            ? '0 4px 20px -8px rgba(239,68,68,0.15)'
                            : isWarning
                              ? '0 4px 20px -8px rgba(234,179,8,0.2)'
                              : '0 4px 20px -8px rgba(34,197,94,0.12)',
                      }}
                    >
                      {isPaused && (
                        <div className="absolute top-2 right-2 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full z-10">
                          Paused
                        </div>
                      )}

                      <div className="grid gap-1 w-full h-full" style={{ gridTemplateColumns: '1fr auto 1fr', gridTemplateRows: '1fr 1fr' }}>
                        <div className="flex items-center justify-center min-w-0 h-full">
                          <PlayerTag name={g.t1p1Name} gender={g.t1p1Gender} level={g.t1p1Level} playerId={g.team1Player1Id} onContextMenu={handlePlayerContextMenu} paused={pausedPlayerIds.has(g.team1Player1Id)} checkedOut={checkedOutPlayerIds.has(g.team1Player1Id)} />
                        </div>

                        <div className="flex flex-col items-center justify-center gap-2 px-2 row-span-2" style={{ gridRow: '1 / 3', gridColumn: '2' }}>
                          <span className="text-base font-extrabold text-zinc-500 tabular-nums tracking-tight">C{g.courtNumber}</span>
                          <div className="w-px flex-1 bg-zinc-200/60" />
                          <span className="text-xs font-bold text-zinc-400">VS</span>
                          <div className="w-px flex-1 bg-zinc-200/60" />
                        </div>

                        <div className="flex items-center justify-center min-w-0 h-full">
                          <PlayerTag name={g.t2p1Name} gender={g.t2p1Gender} level={g.t2p1Level} playerId={g.team2Player1Id} onContextMenu={handlePlayerContextMenu} paused={pausedPlayerIds.has(g.team2Player1Id)} checkedOut={checkedOutPlayerIds.has(g.team2Player1Id)} />
                        </div>

                        <div className="flex items-center justify-center min-w-0 h-full" style={{ gridRow: '2', gridColumn: '1' }}>
                          <PlayerTag name={g.t1p2Name} gender={g.t1p2Gender} level={g.t1p2Level} playerId={g.team1Player2Id} onContextMenu={handlePlayerContextMenu} paused={pausedPlayerIds.has(g.team1Player2Id)} checkedOut={checkedOutPlayerIds.has(g.team1Player2Id)} />
                        </div>

                        <div className="flex items-center justify-center min-w-0 h-full" style={{ gridRow: '2', gridColumn: '3' }}>
                          <PlayerTag name={g.t2p2Name} gender={g.t2p2Gender} level={g.t2p2Level} playerId={g.team2Player2Id} onContextMenu={handlePlayerContextMenu} paused={pausedPlayerIds.has(g.team2Player2Id)} checkedOut={checkedOutPlayerIds.has(g.team2Player2Id)} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pending Games — hidden during warning (shown as overlay) */}
          {pendingGames.length > 0 && !isWarning && (
            <div className="flex-1 min-h-0 mb-4 flex flex-col">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 shrink-0">
                {activeGames.length > 0 ? 'Next Round' : 'Pending'}
              </h3>
              <div className="grid grid-cols-2 gap-3 flex-1 min-h-0" style={{ gridTemplateRows: '1fr 1fr' }}>
                {pendingGames.map(g => (
                  <div
                    key={g.id}
                    className="bg-white rounded-2xl border border-zinc-200/70 p-5 h-full flex items-center"
                    style={{ boxShadow: '0 2px 12px -4px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02)' }}
                  >
                    <div className="grid gap-1 w-full h-full" style={{ gridTemplateColumns: '1fr auto 1fr', gridTemplateRows: '1fr 1fr' }}>
                      <div className="flex items-center justify-center min-w-0 h-full">
                        <DropSlot gameId={g.id} slot="team1Player1Id" playerId={g.team1Player1Id} onDropPlayer={handleDropPlayer}>
                          <PlayerTag name={g.t1p1Name} gender={g.t1p1Gender} level={g.t1p1Level} playerId={g.team1Player1Id} onContextMenu={handlePlayerContextMenu} paused={pausedPlayerIds.has(g.team1Player1Id)} checkedOut={checkedOutPlayerIds.has(g.team1Player1Id)} />
                        </DropSlot>
                      </div>
                      <div className="flex flex-col items-center justify-center gap-2 px-2 row-span-2" style={{ gridRow: '1 / 3', gridColumn: '2' }}>
                        <span className="text-base font-extrabold text-zinc-500 tabular-nums tracking-tight">C{g.courtNumber}</span>
                        <div className="w-px flex-1 bg-zinc-200/60" />
                        <span className="text-xs font-bold text-zinc-400">VS</span>
                        <div className="w-px flex-1 bg-zinc-200/60" />
                      </div>
                      <div className="flex items-center justify-center min-w-0 h-full">
                        <DropSlot gameId={g.id} slot="team2Player1Id" playerId={g.team2Player1Id} onDropPlayer={handleDropPlayer}>
                          <PlayerTag name={g.t2p1Name} gender={g.t2p1Gender} level={g.t2p1Level} playerId={g.team2Player1Id} onContextMenu={handlePlayerContextMenu} paused={pausedPlayerIds.has(g.team2Player1Id)} checkedOut={checkedOutPlayerIds.has(g.team2Player1Id)} />
                        </DropSlot>
                      </div>
                      <div className="flex items-center justify-center min-w-0 h-full" style={{ gridRow: '2', gridColumn: '1' }}>
                        <DropSlot gameId={g.id} slot="team1Player2Id" playerId={g.team1Player2Id} onDropPlayer={handleDropPlayer}>
                          <PlayerTag name={g.t1p2Name} gender={g.t1p2Gender} level={g.t1p2Level} playerId={g.team1Player2Id} onContextMenu={handlePlayerContextMenu} paused={pausedPlayerIds.has(g.team1Player2Id)} checkedOut={checkedOutPlayerIds.has(g.team1Player2Id)} />
                        </DropSlot>
                      </div>
                      <div className="flex items-center justify-center min-w-0 h-full" style={{ gridRow: '2', gridColumn: '3' }}>
                        <DropSlot gameId={g.id} slot="team2Player2Id" playerId={g.team2Player2Id} onDropPlayer={handleDropPlayer}>
                          <PlayerTag name={g.t2p2Name} gender={g.t2p2Gender} level={g.t2p2Level} playerId={g.team2Player2Id} onContextMenu={handlePlayerContextMenu} paused={pausedPlayerIds.has(g.team2Player2Id)} checkedOut={checkedOutPlayerIds.has(g.team2Player2Id)} />
                        </DropSlot>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Warning overlay: next round preview on top of active games */}
        {isWarning && pendingGames.length > 0 && (
          <div
            className="absolute inset-0 z-30 flex flex-col items-center overflow-hidden"
            style={{ backgroundColor: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(2px)' }}
          >
            <div className="w-[85%] h-full flex flex-col items-center justify-center" style={{ maxWidth: '900px' }}>
              <div className="flex items-center gap-3 mb-6 shrink-0">
                <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
                <h3 className="text-xl font-bold text-amber-700 tracking-tight">
                  Next Round Preview
                </h3>
                <span className="text-sm text-amber-500 font-medium">
                  ({pendingGames.length} courts)
                </span>
              </div>
              <div
                className="grid gap-4 w-full flex-1"
                style={{
                  gridTemplateColumns: pendingGames.length === 1 ? '1fr' : '1fr 1fr',
                  maxWidth: pendingGames.length === 1 ? '420px' : undefined,
                  alignContent: 'center',
                }}
              >
                {pendingGames.map(g => (
                  <div
                    key={g.id}
                    className="bg-white/95 rounded-2xl border border-amber-200/60 p-6 h-full flex items-center"
                    style={{ boxShadow: '0 8px 30px -8px rgba(234,179,8,0.25)' }}
                  >
                    <div className="grid gap-1 w-full h-full" style={{ gridTemplateColumns: '1fr auto 1fr', gridTemplateRows: '1fr 1fr' }}>
                      <div className="flex items-center justify-center min-w-0 h-full">
                        <PlayerTag name={g.t1p1Name} gender={g.t1p1Gender} level={g.t1p1Level} playerId={g.team1Player1Id} onContextMenu={handlePlayerContextMenu} paused={pausedPlayerIds.has(g.team1Player1Id)} checkedOut={checkedOutPlayerIds.has(g.team1Player1Id)} />
                      </div>
                      <div className="flex flex-col items-center justify-center gap-2 px-2 row-span-2" style={{ gridRow: '1 / 3', gridColumn: '2' }}>
                        <span className="text-base font-extrabold text-amber-600 tabular-nums tracking-tight">C{g.courtNumber}</span>
                        <div className="w-px flex-1 bg-amber-200/60" />
                        <span className="text-xs font-bold text-amber-400">VS</span>
                        <div className="w-px flex-1 bg-amber-200/60" />
                      </div>
                      <div className="flex items-center justify-center min-w-0 h-full">
                        <PlayerTag name={g.t2p1Name} gender={g.t2p1Gender} level={g.t2p1Level} playerId={g.team2Player1Id} onContextMenu={handlePlayerContextMenu} paused={pausedPlayerIds.has(g.team2Player1Id)} checkedOut={checkedOutPlayerIds.has(g.team2Player1Id)} />
                      </div>
                      <div className="flex items-center justify-center min-w-0 h-full" style={{ gridRow: '2', gridColumn: '1' }}>
                        <PlayerTag name={g.t1p2Name} gender={g.t1p2Gender} level={g.t1p2Level} playerId={g.team1Player2Id} onContextMenu={handlePlayerContextMenu} paused={pausedPlayerIds.has(g.team1Player2Id)} checkedOut={checkedOutPlayerIds.has(g.team1Player2Id)} />
                      </div>
                      <div className="flex items-center justify-center min-w-0 h-full" style={{ gridRow: '2', gridColumn: '3' }}>
                        <PlayerTag name={g.t2p2Name} gender={g.t2p2Gender} level={g.t2p2Level} playerId={g.team2Player2Id} onContextMenu={handlePlayerContextMenu} paused={pausedPlayerIds.has(g.team2Player2Id)} checkedOut={checkedOutPlayerIds.has(g.team2Player2Id)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* === RIGHT: Waiting Pool Sidebar === */}
      <aside className="bg-white border-l border-zinc-200/70 flex flex-col shrink-0 relative"
        style={{ width: poolWidth, boxShadow: '-4px 0 20px -12px rgba(0,0,0,0.06)' }}>
        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-zinc-300/40 active:bg-zinc-400/40 transition-colors z-10"
        />
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <h3 className="text-sm font-bold text-zinc-700 tracking-tight">Waiting Pool</h3>
            <span className="ml-auto text-xs text-zinc-400 font-medium tabular-nums">
              {waitingPlayers.length} players
            </span>
          </div>
        </div>

        {/* Checkin search */}
        <div className="px-3 py-2.5 border-b border-zinc-100">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={checkinSearch}
              onChange={(e) => setCheckinSearch(e.target.value)}
              placeholder="Search player to check in..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all"
            />
          </div>
          {/* Checkin feedback — absolute to prevent layout shift */}
          {checkinFeedback && (
            <div className="absolute left-3 right-3 top-full mt-1 z-50 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 text-center shadow-[0_4px_12px_-4px_rgba(5,150,105,0.15)]" style={{ animation: 'ctxFadeIn 0.15s ease' }}>
              {checkinFeedback} checked in
            </div>
          )}
          {/* Search results dropdown */}
          {searchResults.length > 0 && (
            <div className="mt-2 rounded-lg border border-zinc-200 bg-white overflow-hidden"
              style={{ boxShadow: '0 4px 16px -8px rgba(0,0,0,0.12)' }}>
              <div className="text-[10px] text-zinc-400 px-2.5 py-1.5 uppercase tracking-wider font-semibold border-b border-zinc-100">
                Available ({searchResults.length})
              </div>
              <div className="max-h-48 overflow-auto">
                {searchResults.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleCheckin(p.id, p.name)}
                    className="w-full text-left px-2.5 py-2 text-sm text-zinc-700 hover:bg-blue-50 flex items-center gap-2.5 transition-colors border-b border-zinc-50 last:border-0"
                  >
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: p.gender === 'male' ? genderColors.male.accent : genderColors.female.accent }}
                    >
                      {p.name[0]}
                    </span>
                    <span className="flex-1 font-medium truncate">{p.name}</span>
                    <span className="text-[10px] text-zinc-400 font-medium shrink-0">Lv{p.level}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Gender summary */}
        <div className="px-5 py-2.5 border-b border-zinc-100 flex gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#93c5fd' }} />
            <span className="text-zinc-500">M <strong className="text-zinc-700">{maleWaiting.length}</strong></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f9a8d4' }} />
            <span className="text-zinc-500">F <strong className="text-zinc-700">{femaleWaiting.length}</strong></span>
          </span>
        </div>

        {/* Player list */}
        <div className="flex-1 overflow-auto p-2.5 space-y-1">
          {waitingPlayers.length === 0 && pausedPlayers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-zinc-400">
              <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <p className="text-sm font-medium">No players waiting</p>
              <p className="text-xs mt-1 opacity-60">All checked-in players are on court</p>
            </div>
          ) : (
            <>
              {waitingPlayers.map((p, i) => (
                <PlayerCard key={p.playerId} p={p} index={i} onContextMenu={handlePlayerContextMenu} />
              ))}
              {pausedPlayers.map((p, i) => (
                <PlayerCard key={p.playerId} p={p} index={waitingPlayers.length + i} onContextMenu={handlePlayerContextMenu} />
              ))}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
