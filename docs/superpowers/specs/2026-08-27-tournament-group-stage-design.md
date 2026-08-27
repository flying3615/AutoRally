# 锦标赛小组赛 + 淘汰赛赛制（Mixed Format）— Design Spec

## Context

`tournaments.format` 目前支持 `knockout`（淘汰赛）和 `round_robin`（循环赛）。第三个选项 `mixed` 在创建界面可选，但后端没有独立逻辑——`src/main/ipc.ts` 里 `tournaments:generateBracket` 的判断是 `format === 'knockout' ? 淘汰赛 : 循环赛`，`mixed` 目前等同于循环赛。

用户希望 `mixed` 真正实现"世界杯式"赛制：先分成若干小组，小组内循环赛，再从每组出线若干名进入淘汰赛。同时希望能手动调整分组名单。

这是个人/组合赛的赛制（`tournament_matches` + `tournament_registrations`），跟团体赛模式（`tournament_teams`/`tournament_team_matches`，见 2026-07-12 的团体赛设计文档）是两个独立概念，互不影响。

淘汰赛阶段复用已有的 `generateKnockoutMatches`/`buildNextKnockoutMatches`/`tournamentsAdvanceWinners`/`tournamentsReassignMatch`（Edit Matchup，手动调整对阵）不做改动。小组赛阶段复用已有的 `generateRoundRobinMatches`/`computeTournamentStandings`/逐局比分录入（`src/shared/badminton.ts`）不做改动。这份设计只新增"分组"这一层和"小组出线 → 生成淘汰赛第一轮"这一步转换逻辑。

## Requirements

- 创建锦标赛选择 `mixed` 赛制时，额外填两个数字：小组数量（`groupCount`）、每组出线人数（`advancePerGroup`，1 或 2）。
- `groupCount × advancePerGroup` 必须是 2 的幂（2/4/8/16...），否则创建时报错拒绝——避免淘汰赛第一轮出现轮空，保持实现简单。
- "生成赛程"时，按注册人平均实力（复用现有 `avgLevel` 排序逻辑）蛇形分配到各小组，每组内部生成循环赛对局（复用 `generateRoundRobinMatches`）。
- 小组赛阶段的记分、小组内排名（胜场 → 净胜分）全部复用已有逻辑，不新增代码。
- 全部小组赛结束后，"生成淘汰赛"：取各组前 `advancePerGroup` 名，按"错位配对"规则生成淘汰赛第一轮，避免同组选手第一轮相遇；后续轮次复用现有淘汰赛推进逻辑。
- 小组赛开始前，允许把某个注册人手动移动到另一个小组；已开始比赛的小组不能再调整名单。
- 淘汰赛阶段的手动调整（换对阵）不新增代码——已有的 Edit Matchup 功能本来就是对任意 `pending` 状态的 `tournament_matches` 行生效，第一轮淘汰赛对局生成后自动可用。

## Data Model

### 新表 `tournament_groups`

```sql
CREATE TABLE IF NOT EXISTS tournament_groups (
  id TEXT PRIMARY KEY,
  tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL   -- 'A', 'B', 'C', ...
);
```

### `tournaments` 新增列

```sql
ALTER TABLE tournaments ADD COLUMN groupCount INTEGER;      -- 仅 format='mixed' 时有值
ALTER TABLE tournaments ADD COLUMN advancePerGroup INTEGER; -- 1 或 2，仅 format='mixed' 时有值
```

### `tournament_registrations` 新增列

```sql
ALTER TABLE tournament_registrations ADD COLUMN groupId TEXT REFERENCES tournament_groups(id);
```

`knockout`/`round_robin` 赛制的报名行这一列始终为 NULL。

### `tournament_matches` 新增列

```sql
ALTER TABLE tournament_matches ADD COLUMN groupId TEXT REFERENCES tournament_groups(id);
```

小组赛阶段的对局这列非空，`round` 列继续表示组内循环赛的轮次（"R1"、"R2"...，语义不变）。淘汰赛阶段的对局（含 mixed 赛制的淘汰赛部分）这列为 NULL，`round` 列继续用现有的 "QF"/"SF"/"F" 命名（复用 `knockoutRoundName`）。

所有迁移按现有风格写在 `src/main/database.ts` 已有的 `try { db.run(...) } catch (_) {}` 迁移列表末尾。

## Group Generation Algorithm

新增到 `src/main/tournament.ts`（纯函数，不碰数据库，风格与 `generateKnockoutMatches` 一致）：

```ts
export interface TournamentGroup {
  id: string;
  name: string;
}

// 按 avgLevel 排序后蛇形分配：第1轮组1→组N，第2轮组N→组1，以此类推
export function assignRegistrationsToGroups(
  registrations: TournamentRegistration[],
  groups: TournamentGroup[],
): Map<string, TournamentRegistration[]> {
  const seeded = [...registrations].sort((a, b) => avgLevel(a) - avgLevel(b));
  const byGroup = new Map<string, TournamentRegistration[]>(groups.map(g => [g.id, []]));
  let dir = 1;
  let idx = 0;
  for (const reg of seeded) {
    byGroup.get(groups[idx]!.id)!.push(reg);
    if (idx === groups.length - 1 && dir === 1) dir = -1;
    else if (idx === 0 && dir === -1) dir = 1;
    else idx += dir;
  }
  return byGroup;
}
```

`ipc.ts` 里的 `tournaments:generateBracket` 处理器在 `format === 'mixed'` 分支：
1. 建 `groupCount` 个 `tournament_groups` 行（名字 A/B/C/...）。
2. 调用 `assignRegistrationsToGroups`，把结果写回每个 `tournament_registrations.groupId`。
3. 对每个小组的注册人列表调用现有 `generateRoundRobinMatches`，插入时带上这个小组的 `groupId`。

## Group-to-Knockout Transition

新增到 `src/main/tournament.ts`：

```ts
export interface GroupStanding extends TournamentStanding {
  groupId: string;
}

// qualifiers: 每组前 advancePerGroup 名的完整名次列表（已按组分好）
export function buildFirstKnockoutRound(
  tournamentId: string,
  groupsInOrder: TournamentGroup[],
  qualifiersByGroup: Map<string, GroupStanding[]>, // 每组已排好名次，[0]=第1名
  advancePerGroup: 1 | 2,
  makeId: IdFactory,
): TournamentMatchRecord[] {
  const winners = groupsInOrder.map(g => qualifiersByGroup.get(g.id)![0]!);
  if (advancePerGroup === 1) {
    // 复用 generateKnockoutMatches 里对半配对的同一段逻辑：
    // 位置 i 对位置 (winners.length - 1 - i)。groupCount 已保证是 2 的幂，
    // 所以这里不会触发 byeMatch。
    const round = knockoutRoundName(winners.length);
    const matches: TournamentMatchRecord[] = [];
    for (let i = 0; i < winners.length / 2; i++) {
      const a = winners[i]!;
      const b = winners[winners.length - 1 - i]!;
      matches.push(pendingMatch(makeId(), tournamentId, round, i + 1,
        { player1Id: a.player1Id, player2Id: a.player2Id },
        { player1Id: b.player1Id, player2Id: b.player2Id }));
    }
    return matches;
  }
  const runnersUp = groupsInOrder.map(g => qualifiersByGroup.get(g.id)![1]!);
  const shifted = [...runnersUp.slice(1), runnersUp[0]!]; // 错位 1 位
  const matches: TournamentMatchRecord[] = [];
  const round = knockoutRoundName(winners.length * 2);
  winners.forEach((w, i) => {
    matches.push(pendingMatch(makeId(), tournamentId, round, i + 1,
      { player1Id: w.player1Id, player2Id: w.player2Id },
      { player1Id: shifted[i]!.player1Id, player2Id: shifted[i]!.player2Id }));
  });
  return matches;
}
```

`ipc.ts` 新增 `tournaments:generateKnockoutFromGroups` 处理器：校验所有小组赛都已 `completed`，对每个小组调用现有 `computeTournamentStandings`（只传该组的对局）取名次，调用 `buildFirstKnockoutRound` 落库。之后的轮次推进（`tournamentsAdvanceWinners`）完全不用改。

**举例**（4 组，每组出线 2 名）：
胜者 WA、WB、WC、WD；亚军 RA、RB、RC、RD 错位 1 位后是 RB、RC、RD、RA。
配对：WA–RB、WB–RC、WC–RD、WD–RA——没有同组对局。

## Manual Group Adjustment

新增 IPC `tournaments:reassignGroup(registrationId, newGroupId)`，纯函数校验放 `tournament.ts`（`validateGroupReassignment`，风格参照已有的 `validateMatchReassignment`）：
- 若该注册人所在小组已有对局状态不是 `pending`，拒绝（小组赛已开始不能再挪人）。
- 若目标小组已有对局状态不是 `pending`，同样拒绝。
- 通过校验后，`UPDATE tournament_registrations SET groupId = ? WHERE id = ?`，并重新生成该小组和目标小组的循环赛对局（人员变了，原有对局要重建）。

## UI

`src/renderer/pages/TournamentDetail.tsx`：
- `format === 'mixed'` 时，Tab 栏新增「Groups」，在「Bracket」之前。
- 「Groups」Tab：每个小组一张卡片，展示组内循环赛对局列表（复用现有对局卡片样式）和小组排名迷你表格（复用 Standings Tab 的表格列定义）。
- 每个未开赛的报名行旁加「Edit Group」按钮，弹出小组选择器（新组件，样式参照已有 `EditMatchupModal`）。
- 所有小组标记为 `completed` 后，「Groups」Tab 顶部出现「Generate Knockout」按钮，调用 `tournaments:generateKnockoutFromGroups`，成功后自动跳转到「Bracket」Tab。
- 「Bracket」Tab 展示淘汰赛部分，跟现有淘汰赛模式完全一样（含 Edit Matchup 按钮）。

## Out of Scope

- 团体赛模式（Team Tournament）不受影响，不加小组概念。
- `groupCount × advancePerGroup` 不是 2 的幂的场景不支持（创建时校验拒绝）。
- 不支持小组循环赛打完一半才临时改小组数量/出线人数。
- 不做"随机抽签"分组，只做蛇形按实力分组（已跟用户确认）。

## Testing

- `src/__tests__/tournament.test.ts` 新增：
  - `assignRegistrationsToGroups` 蛇形分配的单元测试（N 组、边界人数不整除的情况）。
  - `buildFirstKnockoutRound` 的错位配对测试，断言任意一组的两名出线者不会在第一轮相遇（advancePerGroup=2，多组场景）。
  - `validateGroupReassignment` 的校验测试（已开赛小组拒绝调整、目标组已开赛拒绝）。
- 复用已有 `computeTournamentStandings`/`generateRoundRobinMatches`/`generateKnockoutMatches` 测试，不用重写。
