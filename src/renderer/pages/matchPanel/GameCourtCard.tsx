import { useState } from 'react';
import { accentWash, courtPhase, genderColors, levelColors } from '../../theme';
import type { CourtPhase } from '../../theme';
import type { AttendanceInfo, GameInfo } from './types';

type PlayerContextHandler = (e: React.MouseEvent, id: string) => void;
type DropPlayerHandler = (gameId: string, slot: string, newPlayerId: string, sourceData?: string) => void;

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
        backgroundColor: over ? accentWash : 'transparent',
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
    const phase: CourtPhase =
      timerPhase === 'paused' ? 'paused'
      : timerPhase === 'ended' ? 'ended'
      : timerPhase === 'warning' ? 'warning'
      : 'running';
    const pc = courtPhase[phase];
    return {
      backgroundColor: pc.surface,
      borderColor: pc.border,
      boxShadow: pc.cardShadow,
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

interface GameCourtCardProps {
  game: GameInfo;
  variant: 'active' | 'pending' | 'warning';
  timerPhase?: 'running' | 'warning' | 'ended' | 'paused';
  pausedPlayerIds: Set<string>;
  checkedOutPlayerIds: Set<string>;
  onContextMenu: PlayerContextHandler;
  onDropPlayer?: DropPlayerHandler;
}

export function GameCourtCard({
  game,
  variant,
  timerPhase,
  pausedPlayerIds,
  checkedOutPlayerIds,
  onContextMenu,
  onDropPlayer,
}: GameCourtCardProps) {
  const isPaused = timerPhase === 'paused';
  const style = gameCardStyle(variant, timerPhase);
  const courtColor = variant === 'warning' ? '#d97706' : '#71717a';
  const lineColor = variant === 'warning' ? 'rgba(253,230,138,0.6)' : 'rgba(228,228,231,0.6)';

  const renderPlayer = (
    slot: 'team1Player1Id' | 'team1Player2Id' | 'team2Player1Id' | 'team2Player2Id',
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
      className="rounded-2xl border p-5 h-full flex items-center relative"
      style={style}
    >
      {isPaused && (
        <div className="absolute top-2 right-2 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full z-10">
          Paused
        </div>
      )}

      <div className="grid gap-1 w-full h-full" style={{ gridTemplateColumns: '1fr auto 1fr', gridTemplateRows: '1fr 1fr' }}>
        <div className="flex items-center justify-center min-w-0 h-full">
          {renderPlayer('team1Player1Id', game.t1p1Name, game.t1p1Gender, game.t1p1Level)}
        </div>

        <div className="flex flex-col items-center justify-center gap-2 px-2 row-span-2" style={{ gridRow: '1 / 3', gridColumn: '2' }}>
          <span className="text-base font-extrabold tabular-nums tracking-tight" style={{ color: courtColor }}>C{game.courtNumber}</span>
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
  );
}
