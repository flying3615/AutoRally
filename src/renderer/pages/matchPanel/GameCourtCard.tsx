import { useState } from 'react';
import { genderColors, levelColors } from '../../theme';
import type { AttendanceInfo, GameInfo } from './types';

type PlayerContextHandler = (e: React.MouseEvent, id: string) => void;
type DropPlayerHandler = (gameId: string, slot: string, newPlayerId: string, sourceData?: string) => void;
type CourtSlot = 'team1Player1Id' | 'team1Player2Id' | 'team2Player1Id' | 'team2Player2Id';

// If the name exceeds the threshold, abbreviate the last word to its initial.
// e.g. "Anastasia Prokhorova" → "Anastasia P."
function displayName(name: string, threshold = 13): string {
  if (name.length <= threshold) return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}

// ── Court header helpers ──
const GAME_TYPE_LABEL: Record<string, string> = {
  'mixed': 'Mixed',
  'male-double': "Men's",
  'female-double': "Women's",
  'open-double': 'Open',
};

function levelRangeLabel(levels: number[]): string {
  const valid = levels.filter(l => Number.isFinite(l));
  if (valid.length === 0) return 'Lv —';
  const lo = Math.min(...valid);
  const hi = Math.max(...valid);
  return lo === hi ? `Lv ${lo}` : `Lv ${lo}-${hi}`;
}

function DropSlot({
  gameId, slot, playerId, onDropPlayer, children,
}: {
  gameId: string;
  slot: string;
  playerId: string;
  onDropPlayer: DropPlayerHandler;
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
  onContextMenu: PlayerContextHandler;
  paused?: boolean;
  checkedOut?: boolean;
}) {
  const isMale = gender === 'male';
  const gc = isMale ? genderColors.male : genderColors.female;
  const textClr = levelColors[level] ?? levelColors[3]!;

  return (
    <div
      className="inline-flex items-center justify-center w-full h-full px-2 py-3 rounded-xl select-none relative min-w-0 overflow-hidden"
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
        title={name}
      >
        {displayName(name)}
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

// ── NEXT UP chip — draggable / droppable next-round slot ──
function NextUpChip({
  game, slot, name, gender, onDropPlayer,
}: {
  game: GameInfo; slot: CourtSlot; name: string; gender: string;
  onDropPlayer?: DropPlayerHandler;
}) {
  const [over, setOver] = useState(false);
  const dot = gender === 'male' ? genderColors.male.accent : genderColors.female.accent;
  const playerId = game[slot];
  const source = `${game.id}:${slot}`;

  return (
    <span
      draggable
      title="Drag to swap — or drop a waiting-pool player here"
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-player-id', playerId);
        e.dataTransfer.setData('application/x-source', source);
        e.dataTransfer.setData('text/plain', playerId);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const draggedId = e.dataTransfer.getData('application/x-player-id') || e.dataTransfer.getData('text/plain');
        const src = e.dataTransfer.getData('application/x-source');
        if (draggedId && onDropPlayer) onDropPlayer(game.id, slot, draggedId, src || undefined);
      }}
      className="inline-flex items-center gap-1.5 cursor-grab text-[13px] font-semibold text-zinc-600 rounded-lg px-2 py-1 truncate max-w-[120px]"
      style={{
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: over ? '#f59e0b' : '#d4d4d8',
        backgroundColor: over ? '#fef3c7' : 'transparent',
        transition: 'background-color 0.12s ease, border-color 0.12s ease',
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function PlayerCard({
  p, index, onContextMenu,
}: {
  p: AttendanceInfo; index: number;
  onContextMenu: PlayerContextHandler;
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

      <span className="flex-1 text-sm font-bold text-zinc-800 truncate">{p.name}</span>

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

function gameCardStyle(variant: GameCourtCardProps['variant'], timerPhase?: GameCourtCardProps['timerPhase']) {
  if (variant === 'active') {
    const isPaused = timerPhase === 'paused';
    const isEnded = timerPhase === 'ended';
    const isWarning = timerPhase === 'warning';
    return {
      backgroundColor: '#ffffff',
      borderColor: isPaused ? '#e7e5e4' : isEnded ? '#fecaca' : isWarning ? '#fde68a' : '#bbf7d0',
      boxShadow: isPaused
        ? '0 4px 20px -10px rgba(120,113,108,0.12)'
        : isEnded
          ? '0 4px 20px -10px rgba(239,68,68,0.18)'
          : isWarning
            ? '0 4px 20px -10px rgba(234,179,8,0.22)'
            : '0 4px 20px -10px rgba(34,197,94,0.18)',
    };
  }

  if (variant === 'warning') {
    return {
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: 'rgba(253,230,138,0.6)',
      boxShadow: '0 8px 30px -8px rgba(234,179,8,0.25)',
    };
  }

  return {
    backgroundColor: '#fff',
    borderColor: 'rgba(228,228,231,0.7)',
    boxShadow: '0 2px 12px -4px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02)',
  };
}

// ── Court header (badge + type/level pill + status indicator) ──
function courtHeaderTokens(variant: GameCourtCardProps['variant'], timerPhase?: GameCourtCardProps['timerPhase']) {
  if (variant === 'active') {
    const map: Record<string, { label: string; color: string; dot: string }> = {
      running: { label: 'LIVE', color: '#16a34a', dot: '#22c55e' },
      warning: { label: 'ENDING', color: '#d97706', dot: '#f59e0b' },
      paused: { label: 'PAUSED', color: '#a16207', dot: '#ca8a04' },
      ended: { label: 'DONE', color: '#dc2626', dot: '#ef4444' },
    };
    const ind = map[timerPhase ?? 'running'] ?? map.running!;
    return {
      badgeBg: timerPhase === 'paused' ? '#78716c' : '#059669',
      badgeShadow: timerPhase === 'paused' ? 'rgba(120,113,108,0.45)' : 'rgba(5,150,105,0.55)',
      pillBg: '#d1fae5',
      pillText: '#047857',
      ind,
    };
  }
  if (variant === 'warning') {
    return {
      badgeBg: '#d97706',
      badgeShadow: 'rgba(217,119,6,0.5)',
      pillBg: '#fef3c7',
      pillText: '#b45309',
      ind: { label: 'NEXT UP', color: '#d97706', dot: '#f59e0b' },
    };
  }
  return {
    badgeBg: '#52525b',
    badgeShadow: 'rgba(82,82,91,0.4)',
    pillBg: '#f4f4f5',
    pillText: '#71717a',
    ind: { label: 'NEXT UP', color: '#94a3b8', dot: '#cbd5e1' },
  };
}

interface GameCourtCardProps {
  game: GameInfo;
  variant: 'active' | 'pending' | 'warning';
  timerPhase?: 'running' | 'warning' | 'ended' | 'paused';
  nextUpGame?: GameInfo;
  pausedPlayerIds: Set<string>;
  checkedOutPlayerIds: Set<string>;
  onContextMenu: PlayerContextHandler;
  onDropPlayer?: DropPlayerHandler;
}

export function GameCourtCard({
  game,
  variant,
  timerPhase,
  nextUpGame,
  pausedPlayerIds,
  checkedOutPlayerIds,
  onContextMenu,
  onDropPlayer,
}: GameCourtCardProps) {
  const style = gameCardStyle(variant, timerPhase);
  const lineColor = variant === 'warning' ? 'rgba(253,230,138,0.6)' : 'rgba(228,228,231,0.6)';
  const { badgeBg, badgeShadow, pillBg, pillText, ind } = courtHeaderTokens(variant, timerPhase);

  const typeLabel = GAME_TYPE_LABEL[game.gameType] ?? 'Match';
  const levelLabel = levelRangeLabel([game.t1p1Level, game.t1p2Level, game.t2p1Level, game.t2p2Level]);

  const renderPlayer = (
    slot: CourtSlot,
    name: string,
    gender: string,
    level: number,
  ) => {
    const playerId = game[slot];
    const tag = (
      <PlayerTag
        name={name}
        gender={gender}
        level={level}
        playerId={playerId}
        onContextMenu={onContextMenu}
        paused={pausedPlayerIds.has(playerId)}
        checkedOut={checkedOutPlayerIds.has(playerId)}
      />
    );

    if (variant !== 'pending' || !onDropPlayer) return tag;
    return (
      <DropSlot gameId={game.id} slot={slot} playerId={playerId} onDropPlayer={onDropPlayer}>
        {tag}
      </DropSlot>
    );
  };

  return (
    <div
      className="rounded-2xl border h-full flex flex-col relative overflow-hidden"
      style={style}
    >
      {/* Header: court badge · type/level pill · status */}
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="rounded-xl flex flex-col items-center justify-center shrink-0"
            style={{ width: 50, height: 50, backgroundColor: badgeBg, boxShadow: `0 8px 18px -8px ${badgeShadow}` }}
          >
            <span className="text-[8px] font-bold leading-none" style={{ letterSpacing: '0.14em', color: 'rgba(255,255,255,0.75)' }}>COURT</span>
            <span className="font-mono font-medium text-white leading-tight" style={{ fontSize: 26 }}>{game.courtNumber}</span>
          </div>
          <span
            className="text-[11px] font-semibold rounded-md px-2 py-1 truncate"
            style={{ color: pillText, backgroundColor: pillBg }}
          >
            {typeLabel} · {levelLabel}
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold shrink-0" style={{ letterSpacing: '0.06em', color: ind.color }}>
          {variant === 'active' && (
            <span className="w-[7px] h-[7px] rounded-full animate-pulse" style={{ backgroundColor: ind.dot }} />
          )}
          {ind.label}
        </span>
      </div>

      {/* Players: 2×2 with VS divider */}
      <div className="flex-1 min-h-0 px-4 pt-2.5 pb-2.5">
        <div className="grid gap-1.5 w-full h-full" style={{ gridTemplateColumns: '1fr auto 1fr', gridTemplateRows: '1fr 1fr' }}>
          <div className="flex items-center justify-center min-w-0 h-full">
            {renderPlayer('team1Player1Id', game.t1p1Name, game.t1p1Gender, game.t1p1Level)}
          </div>

          <div className="flex flex-col items-center justify-center gap-1.5 px-1" style={{ gridRow: '1 / 3', gridColumn: '2' }}>
            <div className="w-px flex-1" style={{ backgroundColor: lineColor }} />
            <span className="text-xs font-bold" style={{ color: variant === 'warning' ? '#f59e0b' : '#a1a1aa' }}>VS</span>
            <div className="w-px flex-1" style={{ backgroundColor: lineColor }} />
          </div>

          <div className="flex items-center justify-center min-w-0 h-full">
            {renderPlayer('team2Player1Id', game.t2p1Name, game.t2p1Gender, game.t2p1Level)}
          </div>

          <div className="flex items-center justify-center min-w-0 h-full" style={{ gridRow: '2', gridColumn: '1' }}>
            {renderPlayer('team1Player2Id', game.t1p2Name, game.t1p2Gender, game.t1p2Level)}
          </div>

          <div className="flex items-center justify-center min-w-0 h-full" style={{ gridRow: '2', gridColumn: '3' }}>
            {renderPlayer('team2Player2Id', game.t2p2Name, game.t2p2Gender, game.t2p2Level)}
          </div>
        </div>
      </div>

      {/* NEXT UP — inline next-round preview (active courts only) */}
      {variant === 'active' && (
        <div
          className="shrink-0 mx-4 mb-3 pt-2.5 flex items-center gap-2 min-w-0"
          style={{ borderTop: '1px dashed #e4e4e7' }}
        >
          <span className="text-[10px] font-bold text-slate-400 shrink-0" style={{ letterSpacing: '0.1em' }}>NEXT UP</span>
          {nextUpGame ? (
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <NextUpChip game={nextUpGame} slot="team1Player1Id" name={nextUpGame.t1p1Name} gender={nextUpGame.t1p1Gender} onDropPlayer={onDropPlayer} />
              <NextUpChip game={nextUpGame} slot="team1Player2Id" name={nextUpGame.t1p2Name} gender={nextUpGame.t1p2Gender} onDropPlayer={onDropPlayer} />
              <span className="text-[11px] font-bold text-slate-300">vs</span>
              <NextUpChip game={nextUpGame} slot="team2Player1Id" name={nextUpGame.t2p1Name} gender={nextUpGame.t2p1Gender} onDropPlayer={onDropPlayer} />
              <NextUpChip game={nextUpGame} slot="team2Player2Id" name={nextUpGame.t2p2Name} gender={nextUpGame.t2p2Gender} onDropPlayer={onDropPlayer} />
            </div>
          ) : (
            <span className="text-[11px] text-zinc-400 font-medium truncate">Waiting for enough players to fill the next round</span>
          )}
        </div>
      )}
    </div>
  );
}
