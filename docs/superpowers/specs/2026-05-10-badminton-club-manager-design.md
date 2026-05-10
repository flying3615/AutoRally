# Badminton Club Manager — Design Spec

## Context

羽毛球俱乐部需要一个离线桌面应用来管理球员、安排比赛对战、追踪会费。俱乐部电脑不联网，需要本地运行，使用 SQLite 做数据存储。

## Overview

Electron + React 桌面应用，支持球员管理、session 签到、自动配对双打对战（含计时器响铃）、会费和余额管理。

## Data Model

### Player（球员）
| Field | Type | Description |
|-------|------|-------------|
| id | TEXT (uuid) | 主键 |
| name | TEXT | 姓名 |
| gender | TEXT (male/female) | 性别 |
| level | INTEGER (1-5) | 水平等级，5档 |
| phone | TEXT | 联系电话 |
| joinDate | TEXT (ISO date) | 加入日期 |

### Session（打球活动）
| Field | Type | Description |
|-------|------|-------------|
| id | TEXT (uuid) | 主键 |
| date | TEXT (ISO date) | 日期 |
| startTime | TEXT | 开始时间 |
| endTime | TEXT | 结束时间（可空） |
| courtCount | INTEGER | 场地数 |
| status | TEXT (active/completed) | 状态 |

### Attendance（签到）
| Field | Type | Description |
|-------|------|-------------|
| id | TEXT (uuid) | 主键 |
| playerId | TEXT (FK) | 球员 |
| sessionId | TEXT (FK) | Session |
| checkinTime | TEXT (ISO datetime) | 签到时间 |

### Game（对战）
| Field | Type | Description |
|-------|------|-------------|
| id | TEXT (uuid) | 主键 |
| sessionId | TEXT (FK) | Session |
| courtNumber | INTEGER | 场地号 |
| team1Player1Id | TEXT (FK) | 队伍1-球员1 |
| team1Player2Id | TEXT (FK) | 队伍1-球员2 |
| team2Player1Id | TEXT (FK) | 队伍2-球员1 |
| team2Player2Id | TEXT (FK) | 队伍2-球员2 |
| status | TEXT (pending/playing/completed) | 状态 |
| roundNumber | INTEGER | 第几轮 |
| gameType | TEXT (same-gender/mixed) | 比赛类型 |
| startedAt | TEXT | 开始时间 |
| endedAt | TEXT | 结束时间 |

### Balance（余额）
| Field | Type | Description |
|-------|------|-------------|
| id | TEXT (uuid) | 主键 |
| playerId | TEXT (FK, UNIQUE) | 球员（一对一） |
| balance | REAL | 当前余额 |
| lastUpdated | TEXT | 最后更新时间 |

### Payment（缴费记录）
| Field | Type | Description |
|-------|------|-------------|
| id | TEXT (uuid) | 主键 |
| playerId | TEXT (FK) | 球员 |
| sessionId | TEXT (FK, nullable) | 关联Session（topup时为空） |
| amount | REAL | 金额 |
| status | TEXT (paid/unpaid) | 状态 |
| paidDate | TEXT | 缴费日期 |
| paymentType | TEXT (session/topup) | 类型 |

### Settings（全局配置）
| Field | Type | Description |
|-------|------|-------------|
| key | TEXT (PRIMARY) | 配置键 |
| value | TEXT | 配置值 |

**默认配置项：** `courtCount`(场地数), `sessionFee`(每次会费), `gameDuration`(每场时长，分钟)

## Matching Algorithm（配对算法）

### 优先级（从高到低）
1. **水平均衡** — 两队水平总和尽量接近
2. **等待时长优先** — 等最久的人先上场，保证每人参与
3. **轮转赛制** — 同性双打和混双交替进行
4. **避免重复搭档** — 尽量不重复安排相同搭档

### 算法步骤
1. 取当前 session 已签到且未在打球的球员（等待池）
2. 按等待时间降序排序
3. 从等待时间最长的开始分组，每组4人：
   a. 在4人组内，按水平排序，最强+最弱 vs 中间两人，确保水平均衡
   b. 根据当前轮次决定赛制（同性/混双），尽量匹配
4. 检查历史搭档记录，如有重复搭档则尝试交换
5. 输出 Game 列表（pending 状态），管理员可手动调整

### 轮转规则
- 奇数轮：同性双打（男双/女双）
- 偶数轮：混双
- 人数/性别不够组混双时，退化为纯水平均衡配对

## Game Timer & Session Flow

### 流程
1. 管理员创建 Session，设定场地数
2. 球员签到（可随时加入，包括中途）
3. 管理员点击"生成对战"→ 自动配对
4. 点击"开始"→ 所有场地同时计时
5. 每场比赛 **结束前 1 分钟** → 响铃提醒
6. **时间到** → 响铃提示结束
7. 自动展示下一轮对战安排（重新配对）
8. 管理员点击"开始"→ 下一轮开始
9. 重复直到管理员结束 Session

### 中途签到
- 签到页始终可用
- 中途签到的球员进入等待池
- 下一轮配对时纳入（等待时长最长优先）

## Pages

| Page | User | Features |
|------|------|----------|
| Dashboard | 管理员 | 今日概览、签到人数、进行中比赛、未缴费提醒 |
| Player Management | 管理员 | 球员 CRUD、水平设定、余额查看、充值 |
| Session Management | 管理员 | 创建/开始/结束 session、签到列表 |
| Check-in | 球员 | 大按钮签到界面（可用平板放置） |
| Match Panel | 管理员 | 比赛列表、计时器、状态管理、配对调整、下一轮预览 |
| Payment Management | 管理员 | 未缴费列表、批量标记已付、充值、余额管理 |
| History | 管理员 | 历史 session 详情、球员参赛统计 |
| Settings | 管理员 | 场地数、会费金额、比赛时长 |

## Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Desktop Shell | Electron | 跨平台桌面应用，离线运行 |
| UI Framework | React + TypeScript | 组件化开发，类型安全 |
| Build Tool | Vite | 开发热更新快 |
| Database | better-sqlite3 | 同步 API，单文件存储，简单可靠 |
| Styling | Tailwind CSS | 快速原型，实用优先 |
| State Management | React Context + useReducer | 应用规模不大，不需要 Redux |

## Project Structure

```
src/
├── main/              # Electron main process
│   ├── index.ts
│   ├── database.ts    # SQLite 初始化和迁移
│   └── ipc.ts         # IPC handlers
├── renderer/          # React UI
│   ├── components/    # 可复用组件
│   ├── pages/         # 页面组件
│   ├── services/      # 业务逻辑
│   │   ├── matching.ts    # 配对算法
│   │   ├── timer.ts       # 比赛计时器
│   │   └── payment.ts     # 会费逻辑
│   ├── hooks/         # 自定义 hooks
│   ├── db/            # 数据库查询层
│   │   ├── players.ts
│   │   ├── sessions.ts
│   │   ├── games.ts
│   │   └── payments.ts
│   └── types/         # TypeScript 类型定义
└── shared/            # main/renderer 共享类型
    └── types.ts
```

## Verification

1. **启动测试** — `npm run dev` 能正常启动 Electron 窗口
2. **球员管理** — CRUD 操作正常，水平等级 1-5
3. **Session 流程** — 创建 session → 签到 → 配对 → 计时 → 轮转 → 结束
4. **配对算法** — 4-12 人签到时，生成的对战满足优先级规则
5. **计时器** — 结束前 1 分钟提醒，时间到响铃
6. **会费** — 签到自动扣费/创建未缴记录，充值增加余额
7. **数据持久化** — 关闭重开后数据保留
