import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GameTimer } from '../services/timer';
import { generateMatches } from '../services/matching';

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
  gameType: string;
  startedAt: string | null;
  endedAt: string | null;
  t1p1Name: string;
  t1p2Name: string;
  t2p1Name: string;
  t2p2Name: string;
}

interface AttendanceInfo {
  id: string;
  playerId: string;
  sessionId: string;
  checkinTime: string;
  name: string;
  gender: string;
  level: number;
}

interface Settings {
  gameDuration: string;
  courtCount: string;
}

type TimerState = { remaining: number; phase: 'running' | 'warning' | 'ended' };

export function MatchPanel() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [attendance, setAttendance] = useState<AttendanceInfo[]>([]);
  const [settings, setSettings] = useState<Settings>({ gameDuration: '15', courtCount: '3' });
  const [timers, setTimers] = useState<Map<number, TimerState>>(new Map());
  const [showNextRound, setShowNextRound] = useState(false);
  const timerRef = useRef<GameTimer | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const [gameList, attendList, allSettings] = await Promise.all([
      window.api.gamesListBySession(sessionId),
      window.api.attendanceListBySession(sessionId),
      window.api.settingsGetAll(),
    ]);
    setGames(gameList as GameInfo[]);
    setAttendance(attendList as AttendanceInfo[]);
    setSettings(allSettings as Settings);
  }, [sessionId]);

  useEffect(() => {
    load();
    timerRef.current = new GameTimer();
    return () => { timerRef.current?.stopAll(); };
  }, [load]);

  const activeGames = games.filter(g => g.status === 'playing');
  const pendingGames = games.filter(g => g.status === 'pending');
  const completedGames = games.filter(g => g.status === 'completed');
  const currentRound = games.length > 0 ? Math.max(...games.map(g => g.roundNumber)) : 0;

  const playingIds = new Set(
    activeGames.flatMap(g => [g.team1Player1Id, g.team1Player2Id, g.team2Player1Id, g.team2Player2Id])
  );
  const pendingIds = new Set(
    pendingGames.flatMap(g => [g.team1Player1Id, g.team1Player2Id, g.team2Player1Id, g.team2Player2Id])
  );
  const inGameIds = new Set([...playingIds, ...pendingIds]);

  const handleGenerate = async () => {
    if (!sessionId) return;
    const maxRound = await window.api.gamesMaxRound(sessionId) as number;
    const nextRound = maxRound + 1;

    const available = attendance.filter(a => !inGameIds.has(a.playerId));
    const pool = available.map(a => ({
      id: a.playerId,
      name: a.name,
      gender: a.gender as 'male' | 'female',
      level: a.level,
      checkinTime: a.checkinTime,
    }));

    const courtCount = Number(settings.courtCount);
    const matches = generateMatches(pool, courtCount, nextRound, games);

    if (matches.length === 0) {
      alert('可用球员不足 4 人，无法生成对战');
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
  };

  const handleStartRound = async () => {
    const duration = Number(settings.gameDuration);
    for (const game of pendingGames) {
      await window.api.gamesStart(game.id);
      timerRef.current?.start(game.courtNumber, duration, (remaining, phase) => {
        setTimers(prev => {
          const next = new Map(prev);
          next.set(game.courtNumber, { remaining, phase });
          return next;
        });
        if (phase === 'warning') {
          timerRef.current?.['warningBell']?.play().catch(() => {});
        }
        if (phase === 'ended') {
          window.api.gamesComplete(game.id).then(() => load());
        }
      });
    }
    load();
    setShowNextRound(false);
  };

  const handleStartSingle = async (game: GameInfo) => {
    const duration = Number(settings.gameDuration);
    await window.api.gamesStart(game.id);
    timerRef.current?.start(game.courtNumber, duration, (remaining, phase) => {
      setTimers(prev => {
        const next = new Map(prev);
        next.set(game.courtNumber, { remaining, phase });
        return next;
      });
      if (phase === 'ended') {
        window.api.gamesComplete(game.id).then(() => {
          load();
          setShowNextRound(true);
        });
      }
    });
    load();
  };

  const handleDeleteGame = async (id: string) => {
    await window.api.gamesDelete(id);
    load();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const waitingPlayers = attendance.filter(a => !inGameIds.has(a.playerId));

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">对战面板</h2>
          <p className="text-sm text-gray-500 mt-1">
            已签到 {attendance.length} 人 · 等待中 {waitingPlayers.length} 人 · 第 {currentRound} 轮
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to={`/checkin/${sessionId}`}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            签到页
          </Link>
          <button
            onClick={handleGenerate}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
          >
            生成对战
          </button>
          {pendingGames.length > 0 && (
            <button
              onClick={handleStartRound}
              className="px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700"
            >
              开始本轮 ({pendingGames.length} 场)
            </button>
          )}
        </div>
      </div>

      {/* Active Games */}
      {activeGames.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">进行中</h3>
          <div className="grid grid-cols-2 gap-4">
            {activeGames.map(g => {
              const timer = timers.get(g.courtNumber);
              return (
                <div key={g.id} className={`rounded-xl border-2 p-5 ${
                  timer?.phase === 'warning' ? 'border-yellow-400 bg-yellow-50' :
                  timer?.phase === 'ended' ? 'border-red-400 bg-red-50' :
                  'border-green-400 bg-green-50'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-500">场地 {g.courtNumber} · {g.gameType === 'mixed' ? '混双' : '同性双打'}</span>
                    <span className="text-2xl font-mono font-bold">
                      {timer ? formatTime(timer.remaining) : '--:--'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-1">队伍 1</p>
                      <p className="font-semibold">{g.t1p1Name}</p>
                      <p className="font-semibold">{g.t1p2Name}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-1">队伍 2</p>
                      <p className="font-semibold">{g.t2p1Name}</p>
                      <p className="font-semibold">{g.t2p2Name}</p>
                    </div>
                  </div>
                  <p className="text-center text-sm text-gray-400 mt-2">VS</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Games */}
      {pendingGames.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">待开始</h3>
          <div className="grid grid-cols-2 gap-4">
            {pendingGames.map(g => (
              <div key={g.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-500">场地 {g.courtNumber} · {g.gameType === 'mixed' ? '混双' : '同性双打'}</span>
                  <div className="flex gap-2">
                    <button onClick={() => handleStartSingle(g)} className="text-xs text-green-600 hover:underline">开始</button>
                    <button onClick={() => handleDeleteGame(g.id)} className="text-xs text-red-600 hover:underline">删除</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">队伍 1</p>
                    <p className="font-semibold">{g.t1p1Name}</p>
                    <p className="font-semibold">{g.t1p2Name}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">队伍 2</p>
                    <p className="font-semibold">{g.t2p1Name}</p>
                    <p className="font-semibold">{g.t2p2Name}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next Round Prompt */}
      {showNextRound && activeGames.length === 0 && pendingGames.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center mb-8">
          <p className="text-lg font-semibold text-blue-800 mb-3">上一轮已结束，是否生成下一轮？</p>
          <button
            onClick={() => { setShowNextRound(false); handleGenerate(); }}
            className="px-6 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            生成下一轮
          </button>
        </div>
      )}

      {/* Waiting Players */}
      {waitingPlayers.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-4 mb-8">
          <h3 className="text-sm font-semibold text-gray-600 mb-2">等待池 ({waitingPlayers.length} 人)</h3>
          <div className="flex flex-wrap gap-2">
            {waitingPlayers.map(p => (
              <span key={p.playerId} className="px-3 py-1 bg-white border border-gray-200 rounded-lg text-sm">
                {p.name} <span className="text-gray-400">Lv{p.level}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Completed Games */}
      {completedGames.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">已完成</h3>
          <div className="space-y-2">
            {completedGames.map(g => (
              <div key={g.id} className="bg-white rounded-lg border border-gray-100 px-5 py-3 flex items-center justify-between text-sm">
                <span className="text-gray-500">第{g.roundNumber}轮 · 场地{g.courtNumber}</span>
                <span>{g.t1p1Name} & {g.t1p2Name} <span className="text-gray-400 mx-2">VS</span> {g.t2p1Name} & {g.t2p2Name}</span>
                <span className="text-gray-400">{g.gameType === 'mixed' ? '混双' : '同性'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
