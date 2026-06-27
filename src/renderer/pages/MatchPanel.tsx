import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useGameContext } from '../contexts/GameContext';
import { genderColors, levelColors } from '../theme';
import { GameCourtCard } from './matchPanel/GameCourtCard';
import { WaitingPoolSidebar } from './matchPanel/WaitingPoolSidebar';
import { formatSecondsAsClock, pendingCountdownLabel } from './matchPanel/time';
import { useMatchGeneration } from './matchPanel/useMatchGeneration';
import { useMatchPanelData } from './matchPanel/useMatchPanelData';
import { useMatchPlayerActions } from './matchPanel/useMatchPlayerActions';
import { useMatchRoundLifecycle } from './matchPanel/useMatchRoundLifecycle';
import type { ContextMenuTarget } from './matchPanel/types';

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
                    className="flex-1 py-2 text-sm font-bold rounded-xl transition-all active:scale-95"
                    style={level === l
                      ? { backgroundColor: levelColors[l], color: l === 1 ? '#065f46' : '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }
                      : { backgroundColor: '#f4f4f5', color: '#71717a' }
                    }
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

// ── Round status bar tokens ──
function roundStatusTokens(phase?: 'running' | 'warning' | 'ended' | 'paused') {
  switch (phase) {
    case 'paused': return { color: '#a16207', label: 'Paused' };
    case 'warning': return { color: '#d97706', label: 'Ending soon' };
    case 'ended': return { color: '#dc2626', label: 'Round over' };
    default: return { color: '#16a34a', label: 'In progress' };
  }
}

// ═══════════════════════════════════════════
// Main MatchPanel Component
// ═══════════════════════════════════════════
export function MatchPanel() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const {
    attendance,
    allPlayers,
    settings,
    load,
    activeGames,
    pendingGames,
    pendingRoundKey,
    currentRound,
    playingIds,
    attendedIds,
    pausedPlayerIds,
    checkedOutPlayerIds,
    waitingPlayers,
    pausedPlayers,
    maleWaiting,
    femaleWaiting,
  } = useMatchPanelData(sessionId);
  const [poolWidth, setPoolWidth] = useState(288);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isDragging = useRef(false);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  };
  const { timers, startGame, pauseGame, resumeGame, earlyFinishGame } = useGameContext();
  const {
    checkinFeedback,
    checkinSearch,
    ctxMenu,
    editTarget,
    handleCheckin,
    handleCheckout,
    handleDropPlayer,
    handleEdit,
    handleEditSaved,
    handlePlayerContextMenu,
    handleRestoreCheckin,
    handleTogglePause,
    searchResults,
    setCheckinSearch,
    setCtxMenu,
    setEditTarget,
  } = useMatchPlayerActions({
    sessionId,
    attendance,
    allPlayers,
    attendedIds,
    checkedOutPlayerIds,
    load,
  });

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

  const handleGenerate = useMatchGeneration({
    sessionId,
    settings,
    attendance,
    playingIds,
    activeGames,
    load,
  });

  const {
    anyPaused,
    finishAll: handleFinishAll,
    isWarning,
    masterTimer,
    pauseAll: handlePauseAll,
    pendingCountdown,
    resumeAll: handleResumeAll,
  } = useMatchRoundLifecycle({
    activeGames,
    pendingGames,
    pendingRoundKey,
    gameDuration: settings.gameDuration,
    timers,
    startGame,
    pauseGame,
    resumeGame,
    earlyFinishGame,
    load,
    generatePendingRound: handleGenerate,
  });

  const roundDurationSeconds = (Number(settings.gameDuration) || 0) * 60;
  const status = roundStatusTokens(masterTimer?.phase);

  // Shared round progress (all courts run on the same clock)
  const roundPct = roundDurationSeconds > 0 && masterTimer
    ? Math.max(0, Math.min(100, (masterTimer.remaining / roundDurationSeconds) * 100))
    : 0;
  const roundBarColor = masterTimer?.phase === 'warning' ? '#f59e0b'
    : masterTimer?.phase === 'paused' ? '#a8a29e'
    : masterTimer?.phase === 'ended' ? '#ef4444' : '#22c55e';

  const pendingByCourt = useMemo(() => {
    const map = new Map<number, typeof pendingGames[number]>();
    for (const g of pendingGames) map.set(g.courtNumber, g);
    return map;
  }, [pendingGames]);

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

            {/* ── Round status bar (active) OR compact controls (idle) ── */}
            {activeGames.length > 0 ? (
              <div
                className="shrink-0 mb-3 relative overflow-hidden flex items-center justify-between gap-6 bg-white border border-zinc-200 rounded-2xl px-5 py-3"
                style={{ boxShadow: '0 2px 8px -4px rgba(0,0,0,0.08)', animation: 'ctxFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
              >
                {/* round + counts */}
                <div className="flex items-center gap-5 min-w-0">
                  <div>
                    <div className="text-[10px] font-bold text-zinc-400" style={{ letterSpacing: '0.12em' }}>ROUND</div>
                    <div className="font-mono font-medium leading-none text-zinc-900" style={{ fontSize: 30, letterSpacing: '-0.03em' }}>{currentRound}</div>
                  </div>
                  <div className="w-px h-9 bg-zinc-200" />
                  <div className="flex flex-col gap-0.5 text-[13px] text-zinc-500 font-medium">
                    <span><strong className="text-zinc-800 font-semibold">{activeGames.length}</strong> courts active</span>
                    <span>
                      <strong className="text-zinc-800 font-semibold">{attendance.length}</strong> checked in
                      <span className="text-zinc-300 mx-1.5">·</span>
                      <strong className="text-zinc-800 font-semibold">{waitingPlayers.length}</strong> waiting
                      {pausedPlayers.length > 0 && (
                        <>
                          <span className="text-zinc-300 mx-1.5">·</span>
                          <strong className="text-amber-600 font-semibold">{pausedPlayers.length}</strong> paused
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* shared timer */}
                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: status.color }}>
                      <span className="w-[7px] h-[7px] rounded-full animate-pulse" style={{ backgroundColor: status.color }} />
                      {status.label}
                    </span>
                    <span className="text-[11px] text-zinc-400 font-medium">Shared round timer</span>
                  </div>
                  <span
                    className="font-mono font-medium tabular-nums leading-none"
                    style={{ fontSize: 54, letterSpacing: '-0.04em', color: status.color }}
                  >
                    {masterTimer ? formatSecondsAsClock(masterTimer.remaining) : '--:--'}
                  </span>
                </div>

                {/* actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {anyPaused ? (
                    <button
                      onClick={handleResumeAll}
                      className="h-9 px-4 bg-emerald-600 text-white text-[13px] font-semibold rounded-lg hover:bg-emerald-700 active:scale-[0.97] transition-transform"
                    >
                      Resume all
                    </button>
                  ) : (
                    <button
                      onClick={handlePauseAll}
                      className="h-9 px-4 bg-amber-500 text-white text-[13px] font-semibold rounded-lg hover:bg-amber-600 active:scale-[0.97] transition-transform"
                    >
                      Pause all
                    </button>
                  )}
                  <button
                    onClick={handleFinishAll}
                    className="h-9 px-4 bg-red-600 text-white text-[13px] font-semibold rounded-lg hover:bg-red-700 active:scale-[0.97] transition-transform"
                    style={{ boxShadow: '0 2px 8px -2px rgba(220,38,38,0.4)' }}
                  >
                    End round
                  </button>
                  <button
                    onClick={toggleFullscreen}
                    title="全屏 (Esc 退出)"
                    className="h-9 w-9 flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                    </svg>
                  </button>
                </div>

                {/* Shared round progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ backgroundColor: '#f4f4f5' }}>
                  <div
                    className="h-full"
                    style={{ width: `${roundPct}%`, backgroundColor: roundBarColor, transition: 'width 1s linear' }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-3">
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
                  <button
                    onClick={toggleFullscreen}
                    title="全屏 (Esc 退出)"
                    className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                    </svg>
                  </button>
                  {pendingGames.length === 0 && (
                    <button
                      onClick={() => { void handleGenerate(); }}
                      className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg
                        hover:bg-emerald-700 active:scale-[0.97] transition-transform"
                    >
                      Generate Matches
                    </button>
                  )}
                  {pendingGames.length > 0 && !isWarning && (
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-lg tabular-nums">
                        {pendingCountdownLabel(pendingCountdown.remaining, pendingCountdown.paused)}
                      </span>
                      {pendingCountdown.paused ? (
                        <button
                          onClick={pendingCountdown.resume}
                          className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg
                            hover:bg-emerald-700 active:scale-[0.97] transition-transform"
                        >
                          Resume
                        </button>
                      ) : (
                        <button
                          onClick={pendingCountdown.pause}
                          className="px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg
                            hover:bg-amber-600 active:scale-[0.97] transition-transform"
                        >
                          Pause
                        </button>
                      )}
                      <button
                        onClick={pendingCountdown.skip}
                        className="px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg
                          hover:bg-blue-700 active:scale-[0.97] transition-transform"
                        style={{ boxShadow: '0 4px 12px -4px rgba(37,99,235,0.4)' }}
                      >
                        Skip Wait
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Round ending soon — get next-up players ready */}
            {activeGames.length > 0 && isWarning && (
              <div
                className="shrink-0 mb-3 flex items-center gap-3 rounded-xl px-4 py-2.5"
                style={{ backgroundColor: '#fef3c7', border: '1px solid #fcd34d', boxShadow: '0 4px 16px -8px rgba(245,158,11,0.4)', animation: 'fadeSlideIn 0.3s ease' }}
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                <span className="text-[13px] font-semibold text-amber-700">
                  Round ending soon — players in the <strong>NEXT UP</strong> rows, head to your court and get ready.
                </span>
              </div>
            )}

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

            {/* Active Games */}
            {activeGames.length > 0 && (
              <div className="flex-1 min-h-0 mb-4 flex flex-col">
                <div className="grid grid-cols-2 gap-3 flex-1 min-h-0" style={{ gridTemplateRows: '1fr 1fr' }}>
                  {activeGames.map(g => (
                    <GameCourtCard
                      key={g.id}
                      game={g}
                      variant="active"
                      timerPhase={timers.get(g.courtNumber)?.phase}
                      nextUpGame={pendingByCourt.get(g.courtNumber)}
                      pausedPlayerIds={pausedPlayerIds}
                      checkedOutPlayerIds={checkedOutPlayerIds}
                      onContextMenu={handlePlayerContextMenu}
                      onDropPlayer={handleDropPlayer}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Pending preview — only before the round starts (next-round shows inline on each live court) */}
            {activeGames.length === 0 && pendingGames.length > 0 && (
              <div className="flex-1 min-h-0 mb-4 flex flex-col">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 shrink-0">
                  Pending
                </h3>
                <div className="grid grid-cols-2 gap-3 flex-1 min-h-0" style={{ gridTemplateRows: '1fr 1fr' }}>
                  {pendingGames.map(g => (
                    <GameCourtCard
                      key={g.id}
                      game={g}
                      variant="pending"
                      pausedPlayerIds={pausedPlayerIds}
                      checkedOutPlayerIds={checkedOutPlayerIds}
                      onContextMenu={handlePlayerContextMenu}
                      onDropPlayer={handleDropPlayer}
                    />
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

      <WaitingPoolSidebar
        width={poolWidth}
        checkinSearch={checkinSearch}
        checkinFeedback={checkinFeedback}
        searchResults={searchResults}
        waitingPlayers={waitingPlayers}
        pausedPlayers={pausedPlayers}
        maleWaitingCount={maleWaiting.length}
        femaleWaitingCount={femaleWaiting.length}
        onResizeStart={handleResizeStart}
        onCheckinSearchChange={setCheckinSearch}
        onCheckin={handleCheckin}
        onPlayerContextMenu={handlePlayerContextMenu}
      />

      {/* ── Fullscreen Overlay ── */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          {/* Header bar */}
          <div className="flex items-center justify-between px-6 shrink-0 border-b border-zinc-100 relative" style={{ height: 64 }}>
            <div className="flex items-center gap-5">
              {masterTimer && (
                <>
                  <span
                    className="font-mono font-medium tabular-nums leading-none"
                    style={{ fontSize: 40, letterSpacing: '-0.04em', color: status.color }}
                  >
                    {formatSecondsAsClock(masterTimer.remaining)}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: status.color }}>
                      <span className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ backgroundColor: status.color }} />
                      {status.label}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {activeGames.length} courts{pendingGames.length > 0 && ` · ${pendingGames.length} pending`}
                    </span>
                  </div>
                  <div className="w-px h-8 bg-zinc-200" />
                  {anyPaused ? (
                    <button
                      onClick={handleResumeAll}
                      className="h-9 px-4 bg-emerald-600 text-white text-[13px] font-semibold rounded-lg hover:bg-emerald-700 active:scale-[0.97] transition-transform"
                    >
                      Resume all
                    </button>
                  ) : (
                    <button
                      onClick={handlePauseAll}
                      className="h-9 px-4 bg-amber-500 text-white text-[13px] font-semibold rounded-lg hover:bg-amber-600 active:scale-[0.97] transition-transform"
                    >
                      Pause all
                    </button>
                  )}
                  <button
                    onClick={handleFinishAll}
                    className="h-9 px-4 bg-red-600 text-white text-[13px] font-semibold rounded-lg hover:bg-red-700 active:scale-[0.97] transition-transform"
                  >
                    End round
                  </button>
                </>
              )}
              {!masterTimer && pendingGames.length > 0 && !isWarning && (
                <>
                  <span className="px-3 py-1.5 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-lg tabular-nums">
                    {pendingCountdownLabel(pendingCountdown.remaining, pendingCountdown.paused)}
                  </span>
                  {pendingCountdown.paused ? (
                    <button
                      onClick={pendingCountdown.resume}
                      className="h-9 px-4 bg-emerald-600 text-white text-[13px] font-semibold rounded-lg hover:bg-emerald-700 active:scale-[0.97] transition-transform"
                    >
                      Resume
                    </button>
                  ) : (
                    <button
                      onClick={pendingCountdown.pause}
                      className="h-9 px-4 bg-amber-500 text-white text-[13px] font-semibold rounded-lg hover:bg-amber-600 active:scale-[0.97] transition-transform"
                    >
                      Pause
                    </button>
                  )}
                  <button
                    onClick={pendingCountdown.skip}
                    className="h-9 px-4 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 active:scale-[0.97] transition-transform"
                  >
                    Skip Wait
                  </button>
                </>
              )}
            </div>
            <button
              onClick={toggleFullscreen}
              title="退出全屏 (Esc)"
              className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            </button>
            {masterTimer && (
              <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ backgroundColor: '#f4f4f5' }}>
                <div
                  className="h-full"
                  style={{ width: `${roundPct}%`, backgroundColor: roundBarColor, transition: 'width 1s linear' }}
                />
              </div>
            )}
          </div>

          {/* Courts grid */}
          <div className="flex-1 min-h-0 p-4">
            {activeGames.length > 0 ? (
              <div
                className="grid gap-4 h-full"
                style={{
                  gridTemplateColumns: activeGames.length === 1 ? '1fr' : '1fr 1fr',
                  gridTemplateRows: activeGames.length <= 2 ? '1fr' : '1fr 1fr',
                }}
              >
                {activeGames.map(g => (
                  <GameCourtCard
                    key={g.id}
                    game={g}
                    variant="active"
                    timerPhase={timers.get(g.courtNumber)?.phase}
                    nextUpGame={pendingByCourt.get(g.courtNumber)}
                    pausedPlayerIds={pausedPlayerIds}
                    checkedOutPlayerIds={checkedOutPlayerIds}
                    onContextMenu={handlePlayerContextMenu}
                    onDropPlayer={handleDropPlayer}
                  />
                ))}
              </div>
            ) : pendingGames.length > 0 ? (
              <div
                className="grid gap-4 h-full"
                style={{
                  gridTemplateColumns: pendingGames.length === 1 ? '1fr' : '1fr 1fr',
                  gridTemplateRows: pendingGames.length <= 2 ? '1fr' : '1fr 1fr',
                }}
              >
                {pendingGames.map(g => (
                  <GameCourtCard
                    key={g.id}
                    game={g}
                    variant="pending"
                    pausedPlayerIds={pausedPlayerIds}
                    checkedOutPlayerIds={checkedOutPlayerIds}
                    onContextMenu={handlePlayerContextMenu}
                    onDropPlayer={handleDropPlayer}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-400">
                <p className="text-sm">暂无进行中的比赛</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
