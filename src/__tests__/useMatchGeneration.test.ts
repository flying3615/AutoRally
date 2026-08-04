import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMatchGeneration } from '../renderer/pages/matchPanel/useMatchGeneration';
import type { AttendanceInfo, GameInfo, Settings } from '../renderer/pages/matchPanel/types';
import type { ElectronAPI } from '../main/preload';

const SESSION_ID = 'session-1';
const settings: Settings = { courtCount: '2', gameDuration: '15' };

type CreatedGame = Parameters<ElectronAPI['gamesCreate']>[0];
const alertMock = vi.fn();

function captureGenerate(params: Parameters<typeof useMatchGeneration>[0]) {
  let generate: ReturnType<typeof useMatchGeneration> | undefined;

  function Harness() {
    generate = useMatchGeneration(params);
    return null;
  }

  renderToStaticMarkup(createElement(Harness));
  return generate!;
}

function attendance(
  playerId: string,
  gender: 'male' | 'female',
  paused = 0,
  index = 0,
): AttendanceInfo {
  return {
    id: `attendance-${playerId}`,
    playerId,
    sessionId: SESSION_ID,
    checkinTime: `2026-08-02T0${index}:00:00.000Z`,
    name: `Player ${playerId}`,
    gender,
    level: 3,
    paused,
  };
}

function game(
  id: string,
  status: GameInfo['status'],
  playerIds: [string, string, string, string],
  roundNumber = 1,
): GameInfo {
  return {
    id,
    sessionId: SESSION_ID,
    courtNumber: 1,
    team1Player1Id: playerIds[0],
    team1Player2Id: playerIds[1],
    team2Player1Id: playerIds[2],
    team2Player2Id: playerIds[3],
    status,
    roundNumber,
    gameType: 'mixed',
    startedAt: status === 'pending' ? null : '2026-08-02T10:00:00.000Z',
    endedAt: status === 'completed' ? '2026-08-02T10:15:00.000Z' : null,
    pausedAt: null,
    pausedSeconds: 0,
    t1p1Name: 'Player one',
    t1p1Gender: 'male',
    t1p1Level: 3,
    t1p2Name: 'Player two',
    t1p2Gender: 'female',
    t1p2Level: 3,
    t2p1Name: 'Player three',
    t2p1Gender: 'male',
    t2p1Level: 3,
    t2p2Name: 'Player four',
    t2p2Gender: 'female',
    t2p2Level: 3,
  };
}

function mockApi(games: GameInfo[], maxRound = 5, attendanceList: AttendanceInfo[] = []) {
  const api = {
    gamesListBySession: vi.fn().mockResolvedValue(games),
    attendanceListBySession: vi.fn().mockResolvedValue(attendanceList),
    gamesDelete: vi.fn().mockResolvedValue(undefined),
    gamesMaxRound: vi.fn().mockResolvedValue(maxRound),
    gamesCreate: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal('window', { api });
  return api;
}

function createdPlayers(payload: CreatedGame): string[] {
  return [
    payload.team1Player1Id,
    payload.team1Player2Id,
    payload.team2Player1Id,
    payload.team2Player2Id,
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useMatchGeneration', () => {
  beforeEach(() => {
    alertMock.mockReset();
    vi.stubGlobal('alert', alertMock);
  });

  it('cleans pending games and schedules checked-in non-paused players into the next round', async () => {
    const players = [
      ...Array.from({ length: 4 }, (_, index) => attendance(`m${index + 1}`, 'male', 0, index)),
      ...Array.from({ length: 4 }, (_, index) => attendance(`f${index + 1}`, 'female', 0, index + 4)),
      attendance('paused-player', 'male', 1, 9),
    ];
    const api = mockApi([
      game('pending-game', 'pending', ['pending-1', 'pending-2', 'pending-3', 'pending-4']),
      game('completed-game', 'completed', ['history-1', 'history-2', 'history-3', 'history-4'], 4),
    ], 5, players);
    const load = vi.fn();

    const result = await captureGenerate({
      sessionId: SESSION_ID,
      settings,
      load,
    })();

    const created = api.gamesCreate.mock.calls.map(([payload]) => payload as CreatedGame);
    expect(result).toBe(true);
    expect(api.gamesDelete).toHaveBeenCalledWith('pending-game');
    expect(api.gamesDelete).toHaveBeenCalledTimes(1);
    expect(api.gamesDelete).not.toHaveBeenCalledWith('completed-game');
    expect(api.gamesMaxRound).toHaveBeenCalledWith(SESSION_ID);
    expect(created).toHaveLength(2);
    expect(created.every(payload => payload.roundNumber === 6)).toBe(true);
    expect(created.every(payload => payload.gameType === 'mixed')).toBe(true);
    for (const payload of created) {
      const playerIds = createdPlayers(payload);
      expect(new Set(playerIds).size).toBe(4);
      expect(playerIds).not.toContain('paused-player');
    }
    expect(load).toHaveBeenCalledOnce();
  });

  it('uses active-game players to fill an undersized next-round pool', async () => {
    const waitingIds = ['waiting-m1', 'waiting-f1', 'waiting-m2', 'waiting-f2'];
    const activeIds = ['active-m1', 'active-f1', 'active-m2', 'active-f2'];
    const pausedActiveId = 'active-paused';
    const activeGames = [
      game('active-game-1', 'playing', [
        pausedActiveId,
        activeIds[1]!,
        activeIds[0]!,
        'history-1',
      ]),
      game('active-game-2', 'playing', [
        activeIds[2]!,
        activeIds[3]!,
        'history-2',
        'history-3',
      ]),
    ];
    const players = [
      attendance(waitingIds[0]!, 'male', 0, 1),
      attendance(waitingIds[1]!, 'female', 0, 2),
      attendance(waitingIds[2]!, 'male', 0, 3),
      attendance(waitingIds[3]!, 'female', 0, 4),
      attendance(activeIds[0]!, 'male', 0, 5),
      attendance(activeIds[1]!, 'female', 0, 6),
      attendance(activeIds[2]!, 'male', 0, 7),
      attendance(activeIds[3]!, 'female', 0, 8),
      attendance(pausedActiveId, 'male', 1, 0),
    ];
    const api = mockApi(activeGames, 5, players);
    const load = vi.fn();
    const eligibleIds = [...waitingIds, ...activeIds];

    const result = await captureGenerate({
      sessionId: SESSION_ID,
      settings,
      load,
    })();

    const created = api.gamesCreate.mock.calls.map(([payload]) => payload as CreatedGame);
    const scheduledIds = created.flatMap(createdPlayers);
    expect(result).toBe(true);
    expect(created).toHaveLength(2);
    expect(created.every(payload => new Set(createdPlayers(payload)).size === 4)).toBe(true);
    expect(created.every(payload => createdPlayers(payload).every(id => eligibleIds.includes(id)))).toBe(true);
    expect(new Set(scheduledIds).size).toBe(8);
    expect(new Set(scheduledIds)).toEqual(new Set(eligibleIds));
    expect(scheduledIds).not.toContain(pausedActiveId);
    expect(load).toHaveBeenCalledOnce();
  });

  it('returns false silently when fewer than four eligible players remain', async () => {
    const api = mockApi([], 2, [
      attendance('m1', 'male', 0, 0),
      attendance('f1', 'female', 0, 1),
      attendance('m2', 'male', 0, 2),
    ]);
    const load = vi.fn();

    const result = await captureGenerate({
      sessionId: SESSION_ID,
      settings,
      load,
    })({ silent: true });

    expect(result).toBe(false);
    expect(api.gamesListBySession).toHaveBeenCalledWith(SESSION_ID);
    expect(api.attendanceListBySession).toHaveBeenCalledWith(SESSION_ID);
    expect(api.gamesMaxRound).toHaveBeenCalledWith(SESSION_ID);
    expect(api.gamesCreate).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });
});
