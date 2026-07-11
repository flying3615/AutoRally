# 团体赛自定义赛制组合（男单/女单/男双/混双/女双）— Design Spec

## Context

代表队循环赛（Teams 功能）目前的"生成队际赛程"只支持一个数字 `gamesPerMatch`：每场队际对抗生成 N 场通用单打，不区分性别、不支持双打。用户希望能像真实羽毛球俱乐部团体赛一样，自定义组合（默认 2 男单 + 2 女单 + 2 男双 + 2 混双 + 1 女双，各项数量可调、可为 0），系统按队伍名册的性别自动分配上场选手，双打配对要按实力就近配对，并支持生成后手动微调换人。

## Requirements

- 生成队际赛程时，用 5 个数字（男单/女单/男双/混双/女双场数）代替原来单一的 `gamesPerMatch`，默认 2/2/2/2/1，均可为 0，生成时逐次可改。
- 系统按队伍名册（`tournament_team_players`，按 `position` 排序）的性别自动分配：
  - 单打：按名册顺序从对应性别池子取 N 人，人数不够就从头循环复用。
  - 双打（男双/女双）：对应性别池子先按 `level` 排序，再按排序后相邻顺位两两配对（`sorted[0]+sorted[1]`、`sorted[2]+sorted[3]`...），配出来的搭档实力接近；池子不够循环复用；池子里可配对的人数（去重后）少于 2 人时，这个类别在这场对抗里跳过。
  - 混双：男池、女池分别按 `level` 排序，按名次一一对应配对（男池第 i 名配女池第 i 名），保证每对混双整体实力档位一致；任一池为空则跳过。
- 某队某类别所需性别池为空（如某队没有女选手但要女单/女双/混双）时，只跳过这一类别在这场对抗里的生成，并在 UI 上给出非阻断的提示，不影响其他类别和其他对抗的生成。
- 生成后，未开打（`status === 'pending'`）的对局可以"微调"换人：按类别限定候选人性别（男单/男双只能换队内男选手，女单/女双只能换女选手，混双"位置1=男/位置2=女"固定），从对应队伍名册里选替换。已完成记分的对局不允许换人。
- 对局卡片要能看出类别（比如显示 "MD2"）。

## Data Model

### `tournament_matches` 新增列（沿用现有 `ALTER TABLE ... ADD COLUMN` 迁移风格，写在 `src/main/database.ts` 已有的迁移列表里）

```sql
ALTER TABLE tournament_matches ADD COLUMN category TEXT;      -- 'MS'|'WS'|'MD'|'XD'|'WD'，非团体赛对局为 NULL
ALTER TABLE tournament_matches ADD COLUMN slotNumber INTEGER; -- 同一场队际对抗里同类别的第几场（MD2 的 2），非团体赛对局为 NULL
```

个人淘汰赛/循环赛的对局不写这两列（保持 NULL），不影响现有逻辑。

### `tournament_team_matches` 新增列

```sql
ALTER TABLE tournament_team_matches ADD COLUMN msCount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tournament_team_matches ADD COLUMN wsCount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tournament_team_matches ADD COLUMN mdCount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tournament_team_matches ADD COLUMN xdCount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tournament_team_matches ADD COLUMN wdCount INTEGER NOT NULL DEFAULT 0;
```

记录这场对抗当时用的赛制组合，供 UI 展示/回溯。原有 `gamesPerMatch` 列保留，生成时写入这 5 个数字之和，不破坏任何现有读取它的地方。

## Generation Algorithm

新增纯函数到 `src/main/tournament.ts`（跟现有 `generateKnockoutMatches`/`generateRoundRobinMatches` 放一起，同样风格：不碰数据库，只算数据结构，由 `ipc.ts` 调用并落库）：

```ts
export interface TeamMatchComposition {
  ms: number;
  ws: number;
  md: number;
  xd: number;
  wd: number;
}

export interface TeamRosterPlayer {
  playerId: string;
  gender: 'male' | 'female';
  level: number;
}

export type TeamMatchCategory = 'MS' | 'WS' | 'MD' | 'XD' | 'WD';

export interface TeamMatchGameSpec {
  category: TeamMatchCategory;
  slotNumber: number;
  team1Player1Id: string;
  team1Player2Id: string | null;
  team2Player1Id: string;
  team2Player2Id: string | null;
}

export interface BuildTeamMatchGamesResult {
  games: TeamMatchGameSpec[];
  skipped: TeamMatchCategory[]; // 类别因为某队人数不够被跳过
}

export function buildTeamMatchGames(
  team1Roster: TeamRosterPlayer[],
  team2Roster: TeamRosterPlayer[],
  composition: TeamMatchComposition,
): BuildTeamMatchGamesResult
```

内部逻辑：
1. 分别把 `team1Roster`/`team2Roster` 按 `gender` 过滤出 male/female 子列表（单打用：保持原始名册顺序；双打/混双用：按 `level` 升序排序后的另一份列表）。
2. 单打（ms/ws）：`pickCycled(pool, count)` 按名册顺序循环取 `count` 个 `playerId`（`pool[i % pool.length]`）；若 `pool.length === 0` 且 `count > 0`，该类别对这场对抗跳过（加入 `skipped`）。
3. 双打（md/wd）：`pairAdjacentByLevel(sortedPool, count)`——若去重后 `sortedPool.length < 2`，跳过；否则按 `pairs[i] = [sorted[(2i) % n], sorted[(2i+1) % n]]` 循环生成 `count` 对（`n = sortedPool.length`，注意 `n` 为奇数时循环取模仍需保证一对里两个 id 不同，若算出相同则取下一个索引）。
4. 混双（xd）：男池、女池各自按 level 排序后按名次循环配对：`pairs[i] = [sortedMale[i % maleLen], sortedFemale[i % femaleLen]]`；若 `maleLen === 0 || femaleLen === 0`，跳过。
5. 两队对应类别、对应顺位的组合拼成一场 `TeamMatchGameSpec`（`team1` 用 team1 该类别第 i 个人/对，`team2` 用 team2 该类别第 i 个人/对）。两队必须都能为该类别出人才生成对局：若两队中任一队该类别被跳过（人数不足），则这个类别在这场对抗里整体跳过，不生成任何该类别的对局，并记入 `skipped`。

## IPC / Backend Wiring

`tournament:teamMatches:generate` 签名从 `(tournamentId, gamesPerMatch = 3)` 改为 `(tournamentId, composition: TeamMatchComposition)`：
- 对 Berger 循环赛程里的每一对队伍，取双方名册（`tournament_team_players` JOIN `players` 拿 gender/level），调用 `buildTeamMatchGames`。
- 把返回的 `games` 落库为 `tournament_matches`（带 `category`/`slotNumber`/`teamMatchId`），`tournament_team_matches` 写入 `msCount/wsCount/mdCount/xdCount/wdCount`（= 传入的 composition，不是实际生成数——UI 提示里体现"跳过了什么"）。
- 汇总所有队伍对局跳过的类别，返回给调用方 `{ teamMatches, warnings: string[] }`（`warnings` 形如 `"华南代表队 vs 华北代表队：缺女选手，女双未生成"`），供 `Settings.tsx`/`TournamentDetail.tsx` 非阻断地展示。

preload.ts 的 `tournamentTeamMatchesGenerate` 类型签名同步更新为 `(tournamentId: string, composition: TeamMatchComposition) => Promise<{ teamMatches: any[]; warnings: string[] }>`。

新增一个 IPC handler 支持微调换人：

```
tournament:teamMatches:reassignPlayers(gameId, { team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id })
```

- 只允许 `status === 'pending'` 的对局改动，否则抛错。
- 按对局的 `category` 校验传入的 id：MS/WS 只有 `team1Player1Id`/`team2Player1Id` 生效（player2 必须为 null）且必须是各自队伍名册里对应性别的成员；MD/WD 两个 slot 都要同性别、都要是各自队伍成员且两人不同；XD 的 player1 必须男、player2 必须女，且都是各自队伍成员。
- 校验通过后直接 `UPDATE tournament_matches SET team1Player1Id=?, team1Player2Id=?, team2Player1Id=?, team2Player2Id=? WHERE id=?`。

## UI Changes (`src/renderer/pages/TournamentDetail.tsx`)

### 1. 生成弹窗（"Generate Team Matches" modal，现在 `showGenerateTeam` 那块，约在文件 566-593 行）

把现有的单一 `gamesPerMatch` 数字选择器换成 5 个带 label 的数字输入（Men's Singles / Women's Singles / Men's Doubles / Mixed Doubles / Women's Doubles），默认值 2/2/2/2/1，各自 `min=0 max=9`。State 从 `const [gamesPerMatch, setGamesPerMatch] = useState('3')` 换成：

```tsx
const [composition, setComposition] = useState({ ms: '2', ws: '2', md: '2', xd: '2', wd: '1' });
```

`handleGenerateTeamMatches` 里把 5 个字符串 `parseInt`（无效值按 0）后传给 `tournamentTeamMatchesGenerate`，生成成功后如果返回了 `warnings`，用现有 `teamError` 状态展示（非阻断，仅提示，不影响已生成的对局）。

### 2. 对局卡片类别标签（bracket 标签页，约 636-686 行）

在现有的对局卡片头部（`Court X` / status badge 那一行）加一个类别徽标——只有 `m.category` 非空时显示（个人赛对局没有这个字段，不受影响）：

```tsx
{m.category && (
  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
    {m.category}{m.slotNumber}
  </span>
)}
```

### 3. 微调换人（"Edit Players" 按钮 + 小弹窗）

对 `m.teamMatchId != null && m.status === 'pending'` 的对局卡片，在现有 "Enter Score" 按钮旁边加一个 "Edit Players" 按钮。点击打开一个小弹窗（复用 `ScoreModal` 同款的 `fixed inset-0 ... bg-white rounded-2xl p-6` 结构），按 `category` 渲染 1 或 2 组"team1 选手下拉框 + team2 选手下拉框"，下拉框选项来自 `tournamentTeamsListPlayers(teamId)` 按 `category` 要求的性别过滤后的名单。保存时调用新的 `tournamentTeamMatchesReassignPlayers` IPC，成功后关闭弹窗并 `load()` 刷新。

## Edge Cases

- 双打配对循环复用的极端情况：如果某性别池子人数不够、又要循环复用凑够场数，排序后相邻配对可能会在"绕回到列表开头"的那一刻把最低分和最高分的选手凑成一对（比如按 level 排序 [1,3,5] 三人要出 2 对时，第二对会是 1 和 5）。这跟"允许循环复用"这个前提本身有点矛盾，但只在名册明显不够用的极端情况下才会出现；出现了也可以用"微调换人"功能手动修正。

- 队伍某性别名册为空、需要该类别 → 跳过该类别，不报错中断整体生成，UI 提示。
- 某类别数量填 0 → 完全不生成该类别，跟"跳过"效果一样但不算进 `warnings`（这是用户主动选择，不是名册不足）。
- 双打/混双池子只有 1 人可配对 → 视为"人数不够"跳过（不能自己配自己）。
- 微调换人时，同一队的双打两个 slot 选到同一个人 → 前端下拉框互相排除已选的那个人，同时 IPC handler 端也要拒绝（不能信任前端校验）。

## Testing

- `src/__tests__/tournament.test.ts` 新增对 `buildTeamMatchGames` 的单测，覆盖：单打循环复用、双打按 level 相邻配对、混双按名次配对、某队缺性别时跳过、去重后不足 2 人跳过双打、组合里某项为 0 不生成。
- `e2e/tournament.spec.ts`（或新开 `e2e/teamTournament.spec.ts`，考虑到这块内容量不小，独立文件更清晰——沿用项目现有"一个 spec 文件一个主题"的组织方式）新增覆盖：建队 → 填不同性别队员 → 用自定义组合生成 → 校验对局数量和类别分布符合预期 → 微调换一个人 → 记分 → 查看队伍排名。

## Out of Scope

- 不做"赛制模板预设"（用户已明确选择每次生成时自定义 5 个数字，不需要预设模板）。
- 不做跨多场对抗的选手轮换/减少重复上场的优化（用户已明确接受"自动分配允许重复上场"，微调功能已经覆盖了个别调整的需求）。
- 不改动个人赛（淘汰赛/循环赛）的任何逻辑，`category`/`slotNumber` 只在团体赛对局上使用。
