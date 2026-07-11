# App 内作者标识（About 卡片）— Design Spec

## Amendments（实现过程中的修订）

代码审查阶段发现并修复了两处跟本 spec 文字描述不完全一致的地方，最终代码以 commit 为准：

- **外链 handler**（`src/main/index.ts`）：在下面 Design 部分给出的最小版本基础上，实现时加了 `https?://` scheme 校验（拒绝非 http(s) 协议）和 `shell.openExternal` 的 `.catch()`（避免 unhandled promise rejection）。见 commit `d96ac8e`。
- **头像样式**：Design 部分原写的是"纯色圆形头像"，但 `DESIGN.md` 明确规定头像应为 `rounded-lg` 圆角方形（squircle）而非圆形，卡片场景下尺寸 32px。实现时改为 `w-8 h-8 rounded-lg`（不是下面写的 `rounded-full`），颜色仍是纯色 emerald。标题也从小号大写 label 改成了跟 "Data Backup" / "Upcoming Sessions" 一致的 `<h3>` 大标题，保持同一文件里 bordered section 的视觉一致性。见 commit `c792a91`。

以下 Design 部分保留原始设计过程的文字，不做回溯修改；实际实现细节以上述 commit 和最终代码为准。

## Context

应用作者希望在 AutoRally 里加上个人署名，展示姓名和 GitHub 链接，让打开这个应用的人知道是谁开发/维护的。

## Requirements

- 展示内容：姓名 "Gabriel Liu" + 可点击链接 "github.com/flying3615"（GitHub 个人主页）。
- 通过可视化看板比较了四个放置方案（侧边栏底部签名 / 状态栏 / Settings 页 About 卡片 / 组合方案），最终选定 **Settings 页 About 卡片**：完整、正式，用户需要主动进入设置页才能看到，不占用其他页面的常驻视觉空间。
- 视觉风格必须遵守 `DESIGN.md`：DM Sans 字体、Zinc 基础色板、单一 emerald（`#059669`）强调色，**禁止渐变、禁止 emoji、禁止纯黑**。图标语言统一用现有的 Heroicons 描边风格（不使用品牌 logo 图标）。

## Design

### 1. 主进程改动（`src/main/index.ts`）— 外链前置修复

现状：`mainWindow` 创建时没有设置 `setWindowOpenHandler`。若 About 卡片的 GitHub 链接直接用 `<a target="_blank">`，Electron 默认行为会弹出一个无地址栏/无导航条的空白 `BrowserWindow` 加载该 URL，体验损坏。

修复：在 `createWindow()` 里，`mainWindow` 创建后加：

```ts
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  shell.openExternal(url);
  return { action: 'deny' };
});
```

需要从 `electron` 额外 import `shell`。这是全局生效的拦截器——以后应用里任何 `target="_blank"` 链接都会正确交给系统默认浏览器打开，不需要为每个外链单独写 IPC。不引入新的 preload API 或 IPC channel。

### 2. 渲染层改动（`src/renderer/pages/Settings.tsx`）— About 区块

在文件末尾 "Upcoming Sessions" 区块之后，新增一个同款分区（复用现有的 `border-t border-zinc-200 pt-10` 分隔样式）：

- 小标题沿用其它分区的 label 样式：`text-[11px] font-semibold text-zinc-400 uppercase tracking-wider` → 文案 "About"
- 卡片内容（`bg-white border border-zinc-200/60 rounded-2xl` 容器，和 Upcoming Sessions 表格外框一致）：
  - 左侧：`w-10 h-10 rounded-full bg-emerald-600 text-white` 纯色圆形头像，居中显示首字母缩写 "GL"（不用渐变、不用图片，避免引入外部资源依赖）
  - 右侧：姓名 "Gabriel Liu"（`font-semibold text-zinc-900`）+ 下方一行链接 "github.com/flying3615"（`text-sm text-emerald-600 hover:text-emerald-700`），末尾带一个小号外链箭头 SVG 图标（复用项目里已有的 Heroicons 描边 SVG 写法，不用 GitHub 品牌 icon）
  - 链接元素：`<a href="https://github.com/flying3615" target="_blank" rel="noopener noreferrer">`，点击后经由上面的 `setWindowOpenHandler` 用系统默认浏览器打开

不新增状态（`useState`）、不新增 API 调用——纯静态展示区块。

### 3. 不做的事（YAGNI）

- 不在侧边栏或状态栏重复加署名（已通过可视化方案比选排除）。
- 不加自定义 slogan/tagline（用户已明确选择"姓名 + 链接"，不需要标语）。
- 不引入头像图片资源或第三方头像服务，纯色+首字母缩写足够，且不产生网络请求（应用本身是离线优先的俱乐部管理工具，`DESIGN.md`/`CLAUDE.md` 强调本地运行）。

## Testing

- `npm run typecheck`：确认新增 JSX/main 进程改动类型正确。
- `npm test`：确认现有单测无回归（该改动不涉及被单测覆盖的业务逻辑，预期无新增用例）。
- `npx playwright test`：跑现有 e2e 套件（尤其 `dashboard.spec.ts`，它已经会访问 Settings 页）确认无回归。
- 不新增 Vitest 单测（纯静态展示内容，无逻辑分支可测）。
- 可选：如需要，可在 e2e 里加一条轻量断言（导航到 `/settings`，检查 About 卡片文本 "Gabriel Liu" 和 GitHub 链接 `href` 可见）——本设计默认不包含，除非后续明确要求。

## Out of Scope

- 不改动应用图标（`build/icon.png`）或安装包的作者元数据（`package.json` 的 `author` 字段等）——这次只做应用内 UI 层面的署名展示。若后续需要在打包元数据里也体现作者信息，是独立的后续任务。
