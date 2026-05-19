import { useMemo, useState, type MouseEvent } from 'react';
import type { AttendanceInfo, ContextMenuTarget, GameInfo, PlayerInfo } from './types';

interface UseMatchPlayerActionsParams {
  sessionId: string | undefined;
  attendance: AttendanceInfo[];
  allPlayers: PlayerInfo[];
  attendedIds: Set<string>;
  checkedOutPlayerIds: Set<string>;
  load: () => void | Promise<void>;
}

export function useMatchPlayerActions({
  sessionId,
  attendance,
  allPlayers,
  attendedIds,
  checkedOutPlayerIds,
  load,
}: UseMatchPlayerActionsParams) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; target: ContextMenuTarget } | null>(null);
  const [editTarget, setEditTarget] = useState<{
    playerId: string; name: string; gender: string; level: number; phone: string;
  } | null>(null);
  const [checkinSearch, setCheckinSearch] = useState('');
  const [checkinFeedback, setCheckinFeedback] = useState<string | null>(null);

  const buildContextTarget = (playerId: string): ContextMenuTarget | null => {
    const attendanceRecord = attendance.find(att => att.playerId === playerId);
    if (attendanceRecord) {
      const match = (attendance as unknown as (AttendanceInfo & { phone: string })[])
        .find(att => att.playerId === playerId);
      return {
        attendanceId: attendanceRecord.id,
        playerId: attendanceRecord.playerId,
        name: attendanceRecord.name,
        gender: attendanceRecord.gender,
        level: attendanceRecord.level,
        phone: (match as unknown as { phone?: string })?.phone ?? '',
        paused: attendanceRecord.paused === 1,
        checkedOut: false,
      };
    }

    if (checkedOutPlayerIds.has(playerId)) {
      const player = allPlayers.find(pl => pl.id === playerId);
      if (!player) return null;
      return {
        attendanceId: '',
        playerId: player.id,
        name: player.name,
        gender: player.gender,
        level: player.level,
        phone: player.phone,
        paused: false,
        checkedOut: true,
      };
    }
    return null;
  };

  const handlePlayerContextMenu = (event: MouseEvent, playerId: string) => {
    const target = buildContextTarget(playerId);
    if (!target) return;
    setCtxMenu({ x: event.clientX, y: event.clientY, target });
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
    const useCash = window.confirm(
      `Re-check in ${target.name}?\n\nOK = Credit   Cancel = Cash`
    );
    const method = useCash ? 'credit' : 'cash';
    try {
      await window.api.attendanceCheckin(target.playerId, sessionId, method as 'credit' | 'cash');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Check-in failed');
      return;
    }
    setCtxMenu(null);
    load();
  };

  const handleEditSaved = () => {
    setEditTarget(null);
    load();
  };

  const handleDropPlayer = async (targetGameId: string, targetSlot: string, draggedPlayerId: string, sourceData?: string) => {
    try {
      if (sourceData) {
        const [srcGameId, srcSlot] = sourceData.split(':');
        if (!srcGameId || !srcSlot || !sessionId) return;

        const allGames = await window.api.gamesListBySession(sessionId) as GameInfo[];
        const targetGame = allGames.find(game => game.id === targetGameId);
        if (targetGame) {
          const slotToPlayer: Record<string, string> = {
            team1Player1Id: targetGame.team1Player1Id,
            team1Player2Id: targetGame.team1Player2Id,
            team2Player1Id: targetGame.team2Player1Id,
            team2Player2Id: targetGame.team2Player2Id,
          };
          const targetPlayerId = slotToPlayer[targetSlot];
          if (!targetPlayerId || targetPlayerId === draggedPlayerId) return;

          await window.api.gamesReplacePlayer(targetGameId, targetSlot, draggedPlayerId);
          try {
            await window.api.gamesReplacePlayer(srcGameId, srcSlot, targetPlayerId);
          } catch (swapErr) {
            await window.api.gamesReplacePlayer(targetGameId, targetSlot, targetPlayerId);
            throw swapErr;
          }
        }
      } else {
        await window.api.gamesReplacePlayer(targetGameId, targetSlot, draggedPlayerId);
      }
    } catch (err) {
      console.error('Replace player failed:', err);
      alert('Failed to move player. Please try again.');
    }
    await load();
  };

  const searchResults = useMemo(
    () => checkinSearch.trim()
      ? allPlayers.filter(player =>
        !attendedIds.has(player.id) &&
        player.name.toLowerCase().includes(checkinSearch.toLowerCase())
      )
      : [],
    [allPlayers, attendedIds, checkinSearch],
  );

  const handleCheckin = async (playerId: string, playerName: string) => {
    if (!sessionId) return;
    await window.api.attendanceCheckin(playerId, sessionId, 'cash');
    setCheckinFeedback(playerName);
    setCheckinSearch('');
    setTimeout(() => setCheckinFeedback(null), 2000);
    load();
  };

  return {
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
  };
}
