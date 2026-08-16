# dsh-hud

DeepSeek Harness（DSH）的 HUD 状态栏插件：在 Web GUI 输入框下方常驻显示当前会话的实时信息，模拟 [pi-agent-hud](https://github.com/dafei1288/pi-agent-hud) 的显示体验。

> 状态 · 上下文占用 · 令牌 · 计时 · 模型 · 路径 · 使用统计 · 费用 · 上一次会话

## 显示内容

分两行呈现，均位于输入框下方的 `conversation.composer.dock` 状态栏位。

**第一行（实时信息栏）**

| 区段 | 说明 | 数据源 |
|---|---|---|
| 状态 | `空闲` / `思考中` / `输出中`（彩色呼吸圆点） | `useSession`（running / partial） |
| 上下文 | 占用百分比 + 进度条（≥75% 黄、≥90% 红）+ `已用/窗口` | `contextPressure` 投影 |
| 令牌 | `↑输入 ↓输出` + 缓存命中率 | `tokenUsage` 投影 |
| 会话 | `N 轮 · M 步` | `sessionStats` 投影 |
| 计时 | LLM 耗时 / 工具耗时 / 平均 TTFT | `sessionStats` 投影 |
| 用时 | 当前回合实时已用时长（运行中每秒刷新） | `turnTimings` |

**第二行（明细：模型 / 路径 / 使用统计 / 费用 / 上一次会话）**

| 区段 | 说明 | 数据源 |
|---|---|---|
| 模型 | 当前会话模型名 | `ctx.modelDirectories`（可选服务，按会话订阅共享 store） |
| 路径 | 当前会话工作目录（`cwd`，悬停显示完整路径） | `useSessions` → `byId[current].cwd` |
| 使用统计 | `输入 X · 输出 Y`（悬停显示未缓存/缓存读/缓存写分桶） | `tokenUsage` 投影 |
| 费用 | 估算费用（单价 × 令牌量，按模型定价） | `tokenUsage` 投影 × `pricing.ts` 价格表 |
| 上一次会话 | 最近一个非当前会话：标题 + 令牌 + 相对时间 | `useSessions` → `SessionListState.ids` |

所有令牌/计时/轮次数字都来自 Host 计算的「全日志持久投影」（`sessionStats` / `tokenUsage` / `contextPressure`），翻页与压缩（compaction）都不会改变它们。

## 费用估算

DSH 只提供令牌用量、不提供计费数据，因此「费用」是本插件按 **单价 × 令牌量** 估算的，单价表在 [`src/client/pricing.ts`](src/client/pricing.ts) 中可编辑（默认人民币，单位 = 每百万 token）：

- `deepseek-chat` / `deepseek-v3`：输入 ¥2 · 缓存读 ¥0.5 · 输出 ¥8
- `deepseek-reasoner` / `deepseek-r1`：输入 ¥4 · 缓存读 ¥1 · 输出 ¥16
- `deepseek-v4`：占位价，请按你的部署实际单价修改
- 未知模型回退到 `deepseek-chat` 单价

货币前缀 `CURRENCY` 与价格表都在 `pricing.ts` 顶部，改完 `pnpm build` 即可。模型名取自 `ctx.modelDirectories`（与输入框的模型选择器共用同一份目录），因此费用会按实际模型计价；若 `ui-model-selection` 被组合移除，则模型段与按模型计价退化为默认单价。

## 原理

- dsh-hud 是一个 **Cordis 客户端插件**：`package.json` 的 `dsh.client` 清单 + `exports["./client"]` 让 modules 节点半边把它扫进 `window.__DSH_BOOT__`，浏览器半边经 `ctx.slots.register` 把组件挂到 `conversation.composer.dock`。
- 挂载走 `ctx.slots.inject('conversation.composer.dock', …)`：等待该槽位被声明后再注册，槽位塌缩时随之卸载。
- 组件只消费框架标准套件（`useSession` / `useSessions` / `useProjection`）、可选服务 `ctx.modelDirectories`（经 `useSyncExternalStore` 订阅其 store）与类型级导入，无任何 `@deepseek-ai` 值级跨包导入。

## 构建

```sh
pnpm install
pnpm build      # 产出 lib/index.js（host 半）与 lib/client.js（浏览器半）
pnpm typecheck  # 可选：类型检查
```

## 安装到某个 profile

**从本地仓库（开发）：**

```sh
dsh plugin --profile web add link:$(pwd)
```

**发布到 npm 后：**

```sh
dsh plugin --profile web add dsh-hud
```

安装后重启 `dsh web` 生效。

也可以手动把 `dsh-hud` 加入该 profile 的 `dsh.profile.bundles`（等价于 `dsh plugin add` 的效果）。

## 已知限制 / 后续可扩展

- **费用是估算值**：单价需按你的实际计费配置维护在 `pricing.ts`，本插件不做账单级精确计算。
- **上一次会话**：取列表顺序中第一个非当前、非空会话；其令牌用量来自该会话的 `tokenUsage` 投影（若该会话未被打开过、投影尚未拉取，则令牌段隐藏）。
- **git 分支**：需要宿主侧的 git 服务投影，当前未实现。
- 状态栏仅在有会话（session 作用域）时显示，与 pi-agent-hud 的终端状态行一致。

## License

MIT
