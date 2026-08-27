# 比赛类型统一判断 + 三个严重 Bug 修复 — Design Spec

## Context

一次全项目代码审查（opus 模型）发现：`tournament_matches` 表其实承载三种不同的"比赛"概念——

- **bracket**：普通淘汰赛/循环赛的比赛（`groupId` 和 `teamMatchId` 都是 NULL）。
- **group**：小组赛+淘汰赛（mixed 赛制）里，小组阶段的比赛（`groupId` 非空）。
- **rubber**：团体赛（Team Tournament）里的单项比赛，比如某一场男双（`teamMatchId` 非空）。

`src/main/ipc.ts` 里每一个碰 `tournament_matches` 表的处理器，都是自己手写 `if (row.teamMatchId)` / `if (row.groupId)` 来区分这三种类型，而且经常漏判或判错。三个严重 bug 都是这个模式的具体案例：

1. `tournaments:setScore`（Bracket 标签页用的计分接口）完全不检查 `teamMatchId`，给团体赛单项计分时，不会像 `tournament:teamMatches:setScore` 那样回写父级 `tournament_team_matches` 的胜场统计——团体赛排名因此悄悄漏算这一场。
2. 没有任何接口检查"这一轮的下一轮是不是已经生成了"——改一场已经产生了下一轮的比赛的比分，数据库记录的赢家和实际晋级的队伍会不一致，没有办法发现或修复。
3. `tournament:teams:delete` 删除团体赛的队伍时，不检查这支队伍是否已经有生成的比赛，数据库外键（`PRAGMA foreign_keys = ON`，且这个外键没有 `ON DELETE` 规则）直接报错，前端 `handleDeleteTeam` 完全没有 try/catch，用户点删除后界面上什么反应都没有。

这份设计的目标：给"比赛类型"这个概念起一个名字（一个纯函数），统一计分入口，修复上面三个严重问题，顺带修复审查发现的、同一根因或紧密相关的五个"重要"问题，并且补上目前完全空白的 IPC 处理器层测试。

## Requirements

- 新增 `matchKind()` 纯函数，三种类型：`'bracket' | 'group' | 'rubber'`，判断优先级 `teamMatchId` > `groupId` > 兜底 `bracket`。
- 把 `tournaments:setScore` 和 `tournament:teamMatches:setScore` 合并成一个内部共享函数，两个 IPC 通道名不变（前端调用方式不用改），但底层只有一份计分+回写逻辑。
- 计分时新增"二次改分保护"：
  - `bracket` 类型：如果这个锦标赛已经有这一轮之外的、`groupId IS NULL` 的其他轮次比赛存在，拒绝改分。
  - `group` 类型：如果这个锦标赛已经生成了淘汰赛阶段（存在 `groupId IS NULL` 的比赛），拒绝改分。
  - `rubber` 类型：不加这个保护（团体赛单项之间没有"下一轮"依赖关系）。
- `tournament:teams:delete` 删除前检查是否有引用它的 `tournament_team_matches` 行，有就拒绝并报错；前端 `handleDeleteTeam` 和 `handleRemovePlayerFromTeam` 补上 `try/catch` + 错误提示。
- 五个"重要"问题一并修：小组赛场地/场次编号跨组连续、排名并列加入净胜局、淘汰赛轮空和团体赛双打配对种子方向改成降序（强者优先）、`tournaments:standings` 排除团体赛单项和小组赛数据、`assignCourt` 不再重置已完成的比赛。
- 新建一套轻量级 IPC 处理器测试架构（内存 sql.js 数据库 + stub `ipcMain.handle`），用来验证这次重构，以后 IPC 层的改动也能用。

## Data Model

不新增表、不新增列。全部是查询条件和排序逻辑的修改。

## `matchKind` 判断函数

新增到 `src/main/tournament.ts`（纯函数，不碰数据库，风格与 `avgLevel`/`teamKey` 等已有小工具函数一致）：

```ts
export type MatchKind = 'rubber' | 'group' | 'bracket';

export function matchKind(row: { teamMatchId: string | null; groupId: string | null }): MatchKind {
  if (row.teamMatchId) return 'rubber';
  if (row.groupId) return 'group';
  return 'bracket';
}
```

## 统一计分入口

`src/main/ipc.ts` 新增一个内部辅助函数（不是 IPC handler，只在文件内部调用），放在现有 `tournaments:setScore` 和 `tournament:teamMatches:setScore` 两个 handler 附近，替换它们的函数体：

```ts
function applyMatchScore(matchId: string, sets: SetScore[]): { winner: 'team1' | 'team2' } {
  const match = queryOne<TournamentMatchRecord & { teamMatchId: string | null; groupId: string | null }>(
    'SELECT * FROM tournament_matches WHERE id = ?', [matchId]
  );
  if (!match) throw new Error('Match not found');

  const kind = matchKind(match);

  if (kind === 'bracket') {
    // A naive "any other round exists" check is wrong — it would also match
    // an EARLIER round (e.g. editing the Final's own score would see the SF
    // round and false-block). Compute the round that would immediately
    // follow this one, the same way buildNextKnockoutMatches does, and only
    // block if THAT round already exists. Reusing knockoutRoundName (moved to
    // an export, see below) keeps this in lockstep with the real advancement
    // logic instead of re-deriving round order by hand.
    const roundMatches = queryAll<{ id: string }>(
      'SELECT id FROM tournament_matches WHERE tournamentId = ? AND groupId IS NULL AND round = ?',
      [match.tournamentId, match.round]
    );
    const nextRound = knockoutRoundName(roundMatches.length);
    if (nextRound !== match.round) {
      const nextRoundExists = queryOne<{ id: string }>(
        'SELECT id FROM tournament_matches WHERE tournamentId = ? AND groupId IS NULL AND round = ? LIMIT 1',
        [match.tournamentId, nextRound]
      );
      if (nextRoundExists) throw new Error('Cannot edit this score — a later round has already been generated');
    }
  }
  if (kind === 'group') {
    const knockoutExists = queryOne<{ id: string }>(
      'SELECT id FROM tournament_matches WHERE tournamentId = ? AND groupId IS NULL LIMIT 1',
      [match.tournamentId]
    );
    if (knockoutExists) throw new Error('Cannot edit this score — the knockout stage has already been generated');
  }

  const { team1Score, team2Score, winner } = computeMatchOutcome(sets);
  const [set1, set2, set3] = sets;

  return transaction(() => {
    run(
      `UPDATE tournament_matches SET
         team1Score = ?, team2Score = ?, winner = ?, status = 'completed', completedAt = ?,
         set1Team1Score = ?, set1Team2Score = ?, set2Team1Score = ?, set2Team2Score = ?, set3Team1Score = ?, set3Team2Score = ?
       WHERE id = ?`,
      [
        team1Score, team2Score, winner, new Date().toISOString(),
        set1!.team1, set1!.team2, set2!.team1, set2!.team2, set3?.team1 ?? null, set3?.team2 ?? null,
        matchId,
      ],
    );

    if (kind === 'rubber') {
      const games = queryAll<{ winner: string | null; status: string }>(
        'SELECT winner, status FROM tournament_matches WHERE teamMatchId = ?', [match.teamMatchId]
      );
      const t1Wins = games.filter(g => g.winner === 'team1').length;
      const t2Wins = games.filter(g => g.winner === 'team2').length;
      const allDone = games.every(g => g.status === 'completed');
      run(
        'UPDATE tournament_team_matches SET team1Wins = ?, team2Wins = ?, status = ? WHERE id = ?',
        [t1Wins, t2Wins, allDone ? 'completed' : 'in_progress', match.teamMatchId]
      );
    }

    return { winner };
  });
}
```

两个现有 IPC handler 都只调用它：

```ts
ipcMain.handle('tournaments:setScore', (_e, matchId: string, sets: SetScore[]) => applyMatchScore(matchId, sets));
ipcMain.handle('tournament:teamMatches:setScore', (_e, gameId: string, sets: SetScore[]) => applyMatchScore(gameId, sets));
```

`import { matchKind, type MatchKind, knockoutRoundName } from './tournament';` 加进 `ipc.ts` 已有的 import 块。`knockoutRoundName`（`tournament.ts:59`）目前是模块内部函数，需要加上 `export`——它本来就是纯函数、没有副作用，`buildNextKnockoutMatches` 内部一直在用同一个函数计算下一轮的名字，这里直接复用，不用重新发明一套"下一轮是什么"的判断逻辑。

**为什么这样修复了严重问题1和2**：从 Bracket 标签页给团体赛单项计分，走的还是 `tournaments:setScore` 这个 IPC 通道，但底层调用的是同一个 `applyMatchScore`，`kind === 'rubber'` 分支现在一定会执行，回写不会再漏掉。二次改分保护对 `bracket`/`group` 类型生效，不会再让数据库里赢家和实际晋级队伍对不上。

## 删除团体赛队伍的外键检查

`src/main/ipc.ts` 里 `tournament:teams:delete`（目前在 1158 行附近）：

```ts
ipcMain.handle('tournament:teams:delete', (_e, teamId: string) => {
  const referencing = queryOne<{ id: string }>(
    'SELECT id FROM tournament_team_matches WHERE team1Id = ? OR team2Id = ? LIMIT 1', [teamId, teamId]
  );
  if (referencing) throw new Error('Cannot delete a team that already has generated matches');
  transaction(() => {
    run('DELETE FROM tournament_team_players WHERE teamId = ?', [teamId]);
    run('DELETE FROM tournament_teams WHERE id = ?', [teamId]);
  });
});
```

`src/renderer/pages/TournamentDetail.tsx` 的 `handleDeleteTeam`（目前 485-490 行）和 `handleRemovePlayerFromTeam`（501-505 行）补上错误处理，风格参照同文件里已有的 `handleAddTeam`：

```ts
const handleDeleteTeam = async (teamId: string) => {
  const ok = await confirm({ title: 'Delete team?', message: 'This will remove all team members from this team.', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  setTeamError(null);
  try {
    await (window.api as any).tournamentTeamsDelete(teamId);
    await load();
  } catch (err: any) {
    setTeamError(err?.message ?? 'Failed to delete team');
  }
};

const handleRemovePlayerFromTeam = async (teamId: string, playerId: string) => {
  setTeamError(null);
  try {
    await (window.api as any).tournamentTeamsRemovePlayer(teamId, playerId);
    await loadTeamPlayers(teamId);
    await load();
  } catch (err: any) {
    setTeamError(err?.message ?? 'Failed to remove player');
  }
};
```

## 五个"重要"问题的修复

### I1：小组赛场地/场次编号跨组连续

`generateRoundRobinMatches`（`tournament.ts:161`）新增两个可选参数，**返回类型不变**（还是直接返回 `TournamentMatchRecord[]`，不包装成带游标的对象）：

```ts
export function generateRoundRobinMatches(
  tournamentId: string,
  registrations: TournamentRegistration[],
  courtCount: number,
  makeId: IdFactory,
  startMatchNumber = 1,
  startCourtIndex = 0,
): TournamentMatchRecord[]
```

函数内部把 `matchNumber` 的起始值换成 `startMatchNumber`，把场地计算从 `(matchInRound % courts) + 1` 换成 `((startCourtIndex + matchInRound) % courts) + 1`（`matchInRound` 的计数方式不变，只是加上一个外部传入的偏移）。不传这两个参数时（`startMatchNumber=1, startCourtIndex=0`）算出来的结果和现在完全一样。

不改返回类型是刻意的：这个函数已经有一个现成的调用方（`ipc.ts:908`，普通循环赛/knockout 不分组的情况）和一个现成的测试（`tournament.test.ts:39`）都把返回值当数组直接用，如果改成"数组+游标"的对象，这两处都要跟着改，属于没必要的连锁改动。

新增一个小的纯函数算"每组打完之后，下一组的场次编号和场地游标该从哪开始"，不用函数改返回值：

```ts
export function roundRobinMatchCount(participantCount: number): number {
  return (participantCount * (participantCount - 1)) / 2;
}
```

（标准循环赛的总场数公式——不管人数是奇数偶数，每两人正好打一场，跟"是否有轮空"无关。）

`src/main/ipc.ts` 里两处按组循环调用它的地方（`generateBracket` 的 mixed 分支、`reassignGroup`）都改成：

```ts
let matchNumberCursor = 1;
let courtIndexCursor = 0;
for (const g of groups) {
  const groupRegs = byGroup.get(g.id) ?? [];
  ...
  const groupMatches = generateRoundRobinMatches(tournamentId, groupRegs, t.courtCount, uuid, matchNumberCursor, courtIndexCursor);
  matchNumberCursor += roundRobinMatchCount(groupRegs.length);
  courtIndexCursor = (courtIndexCursor + roundRobinMatchCount(groupRegs.length)) % t.courtCount;
  ...
}
```

现有的单一循环赛/knockout 调用方（`ipc.ts:908`，不分组的情况）完全不用改——不传后两个参数，行为和现在一模一样。

两处调用点各自已有的 `courtCount` 取值方式不变（`generateBracket` 里是 `t.courtCount`，`reassignGroup` 里是 `t?.courtCount ?? 4`），游标计算里的 `t.courtCount`/`courtCount` 用回各自那一处已有的变量，上面只是示意写法。

### I2：排名并列加入净胜局

`computeTournamentStandings` 的排序（`tournament.ts:413`）：

```ts
return [...standings.values()].sort((a, b) =>
  b.wins - a.wins
  || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost)
  || (b.pf - b.pa) - (a.pf - a.pa)
);
```

### I3/I4：种子排序方向改成降序

三处排序方向反过来（`avgLevel(b) - avgLevel(a)` / `b.level - a.level`）：
- `generateKnockoutMatches`（`tournament.ts:138`）——轮空给最强的选手。
- `pairAdjacentByLevel`（`tournament.ts:591`）——男双/女双第1对是最强配对。
- `pairMixedByLevel`（`tournament.ts:602-603`）——混双同理。

`assignRegistrationsToGroups`（`tournament.ts:211`）**不改**——蛇形分组的排序方向不影响分组是否均衡，改了没有意义，只会让快照测试的分组结果跟没改之前对不上而已。

这三处改动会让 `tournament.test.ts` 里依赖具体对阵结果的测试失败，需要照新的（正确的）方向重新计算并更新预期值，不是简单地"让测试通过"，是先手算验证新方向是对的，再更新测试。

### I5：总排名混入团体赛/小组数据

`tournaments:standings`（`ipc.ts`）的查询：

```ts
const matches = queryAll<TournamentMatchRecord>(
  "SELECT * FROM tournament_matches WHERE tournamentId = ? AND status = 'completed' AND teamMatchId IS NULL AND groupId IS NULL",
  [tournamentId]
);
```

### I7：分配场地不再重置已完成的比赛

`tournament:teamMatches:assignCourt`（`ipc.ts:1349`附近）：

```ts
run(
  "UPDATE tournament_matches SET courtNumber = ?, status = 'in_progress' WHERE id = ? AND status != 'completed'",
  [courtNumber, gameId]
);
```

## IPC 处理器测试架构

新建 `src/__tests__/ipcHandlers.test.ts`（新文件）。不新增 `initDb` 的"内存模式"参数——`src/__tests__/databasePersistence.test.ts` 已经有一套现成、经过验证的写法：mock `electron` 的 `app.getPath`/`getAppPath` 返回固定假路径，同时 mock `fs` 让 `existsSync` 恒为 `false`，这样 `initDb()` 内部的"文件存在就读取"分支永远不会走到，会自然创建一个全新的、纯内存的 `sql.js` 数据库，`writeFileSync` 等落盘调用也都是空操作。新测试直接照抄这个模式，不需要改 `database.ts` 本身：

```ts
import fs from 'fs';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => 'ipc-handlers-test-app',
    getPath: () => 'ipc-handlers-test-data',
    isPackaged: false,
  },
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  dialog: {},
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    renameSync: vi.fn(),
    writeFileSync: vi.fn(),
    openSync: vi.fn(() => 1),
    fsyncSync: vi.fn(),
    closeSync: vi.fn(),
  },
}));

import { ipcMain } from 'electron';
import { closeDb } from '../main/database';
import { registerIpcHandlers } from '../main/ipc';

async function setupHandlers() {
  const handlers = new Map<string, (...args: any[]) => any>();
  vi.mocked(ipcMain.handle).mockImplementation((channel: string, fn: any) => { handlers.set(channel, fn); });
  await registerIpcHandlers();
  return handlers;
}

describe('tournament IPC handlers', () => {
  afterEach(() => { closeDb(); vi.clearAllMocks(); });
  // ...
});
```

`registerIpcHandlers()` 内部自己调用 `initDb()`，不用在测试里再单独调一次。每个测试用例结束后调用 `closeDb()` 重置单例，保证测试之间互不干扰——这一点和 `databasePersistence.test.ts` 已有的 `afterEach` 一致。

至少覆盖以下场景（对应三个严重问题 + IPC 层此前是 0 覆盖）：
- 给团体赛单项计分后，父级 `tournament_team_matches` 的胜场和状态正确更新（严重问题1的回归测试）。
- 淘汰赛某一轮的下一轮已经生成后，再次调用计分接口应该抛错（严重问题2）。
- 小组赛已经生成淘汰赛之后，再给某个小组的比赛计分应该抛错（严重问题2的 group 分支）。
- 删除一个已经有生成比赛的团体赛队伍应该抛错，不应该抛出裸露的外键错误（严重问题3）。
- `tournaments:standings` 返回结果不包含团体赛单项和小组赛数据（I5）。
- `assignCourt` 对一场已完成的比赛调用后，状态仍然是 `completed`（I7）。

## Out of Scope

- 不把 `ipc.ts` 按功能域拆分成多个文件（审查的"建议5"）——这是更大的文件结构改动，且和这次的 bug 修复目标关系不大，单独讨论。
- 不处理次要（Minor）级别的发现（死表、迁移错误吞掉、`upcomingSessions:list` 在读时写等）——不在这次"统一修复"的范围内。
- 不处理 I6（`tournaments:unregister` 缺少校验）和 I9 提到的 `tournaments:update` 未校验问题——审查指出这两个接口目前在前端都没有调用方，属于潜在风险但不是本次范围。
- 不新建 e2e 测试——IPC 层的行为用新的轻量级测试架构覆盖，已有的 `e2e/*.spec.ts` 不用动。

## Testing

- 上面提到的新 `ipcHandlers.test.ts`。
- `tournament.test.ts` 里 `generateKnockoutMatches`、`pairAdjacentByLevel`、`pairMixedByLevel`、`computeTournamentStandings` 相关的现有测试，按新的排序方向/新的并列规则更新预期值。
- `generateRoundRobinMatches` 新增测试：验证传入 `startMatchNumber`/`startCourtIndex` 后，第一场比赛的 `matchNumber`/`courtNumber` 确实从传入值开始算；不传这两个参数时，结果和现在完全一致（向后兼容，不能破坏 `tournament.test.ts:39` 那个已有的、直接把返回值当数组用的测试）。
- `roundRobinMatchCount` 新增测试：覆盖偶数、奇数人数各一个例子，确认算出来的总场数和 `generateRoundRobinMatches` 实际生成的场数一致。
