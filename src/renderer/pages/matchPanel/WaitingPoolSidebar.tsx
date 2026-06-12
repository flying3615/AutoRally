import { genderColors } from '../../theme';
import { PlayerCard } from './GameCourtCard';
import type { AttendanceInfo, PlayerInfo } from './types';

interface WaitingPoolSidebarProps {
  width: number;
  checkinSearch: string;
  checkinFeedback: string | null;
  searchResults: PlayerInfo[];
  waitingPlayers: AttendanceInfo[];
  pausedPlayers: AttendanceInfo[];
  maleWaitingCount: number;
  femaleWaitingCount: number;
  onResizeStart: (event: React.MouseEvent) => void;
  onCheckinSearchChange: (value: string) => void;
  onCheckin: (playerId: string, playerName: string) => void;
  onPlayerContextMenu: (event: React.MouseEvent, playerId: string) => void;
}

export function WaitingPoolSidebar({
  width,
  checkinSearch,
  checkinFeedback,
  searchResults,
  waitingPlayers,
  pausedPlayers,
  maleWaitingCount,
  femaleWaitingCount,
  onResizeStart,
  onCheckinSearchChange,
  onCheckin,
  onPlayerContextMenu,
}: WaitingPoolSidebarProps) {
  return (
    <aside className="bg-white border-l border-zinc-200/70 flex flex-col shrink-0 relative"
      style={{ width, boxShadow: '-4px 0 20px -12px rgba(0,0,0,0.06)' }}>
      <div
        onMouseDown={onResizeStart}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-zinc-300/40 active:bg-zinc-400/40 transition-colors z-10"
      />

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

      <div className="px-3 py-2.5 border-b border-zinc-100">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={checkinSearch}
            onChange={(e) => onCheckinSearchChange(e.target.value)}
            placeholder="Search player to check in..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-gray-100 transition-all"
          />
        </div>

        {checkinFeedback && (
          <div className="absolute left-3 right-3 top-full mt-1 z-50 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 text-center shadow-[0_4px_12px_-4px_rgba(5,150,105,0.15)]" style={{ animation: 'ctxFadeIn 0.15s ease' }}>
            {checkinFeedback} checked in
          </div>
        )}

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
                  onClick={() => onCheckin(p.id, p.name)}
                  className="w-full text-left px-2.5 py-2 text-sm text-zinc-700 hover:bg-blue-50 flex items-center gap-2.5 transition-colors border-b border-zinc-50 last:border-0"
                >
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: p.gender === 'male' ? genderColors.male.accent : genderColors.female.accent }}
                  >
                    {p.name[0]}
                  </span>
                  <span className="flex-1 font-bold truncate">{p.name}</span>
                  <span className="text-[10px] text-zinc-400 font-medium shrink-0">Lv{p.level}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-2.5 border-b border-zinc-100 flex gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#93c5fd' }} />
          <span className="text-zinc-500">M <strong className="text-zinc-700">{maleWaitingCount}</strong></span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f9a8d4' }} />
          <span className="text-zinc-500">F <strong className="text-zinc-700">{femaleWaitingCount}</strong></span>
        </span>
      </div>

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
              <PlayerCard key={p.playerId} p={p} index={i} onContextMenu={onPlayerContextMenu} />
            ))}
            {pausedPlayers.map((p, i) => (
              <PlayerCard key={p.playerId} p={p} index={waitingPlayers.length + i} onContextMenu={onPlayerContextMenu} />
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
