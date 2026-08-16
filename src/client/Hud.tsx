/**
 * Hud: the dsh-hud live status bar. Mounted on 'conversation.composer.dock'
 * (session scope), it reads the durable whole-log projections, the session
 * list, and the optional model directory. Two rows:
 *
 *   row 1 (info bar)  — status / context / tokens / turns-steps / timing / elapsed
 *   row 2 (detail)    — model / path / usage stats / cost / previous session
 *
 * Every section is togglable through the config panel opened by clicking the
 * `HUD` badge; settings persist to localStorage.
 */
import { Fragment, memo, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type {
  ConversationSnapshot,
  SessionListState,
  SnapshotStore,
  UseProjection,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pull the 'conversation.composer.dock' SlotMap key.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pull the sessionStats / tokenUsage / contextPressure projection keys.
import type {} from '@deepseek-ai/dsh-session-stats/client'
import type { ContextPressureProjection, TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { computeCost, formatCost } from './pricing.ts'
import { loadConfig, saveConfig, subscribeConfig, type HudConfig, type HudPricing, type HudSections } from './config.ts'

interface HudProps {
  useSession: SnapshotSelectorHook<ConversationSnapshot>
  useSessions: SnapshotSelectorHook<SessionListState>
  useProjection: UseProjection
  /** Optional model-directory store (absent when ui-model-selection is composed out). */
  modelDirectory?: SnapshotStore<ModelDirectoryState>
}

/** Stable fallback snapshot while the model directory is unavailable. */
const EMPTY_DIRECTORY: ModelDirectoryState = {
  current: null, routable: null, groups: [], failures: [], status: 'idle', error: null,
}

/** Display sections, in render order, with their toggle labels. */
const SECTION_ITEMS: readonly { key: keyof HudSections; label: string }[] = [
  { key: 'status', label: '状态' },
  { key: 'context', label: '上下文' },
  { key: 'tokens', label: '令牌' },
  { key: 'session', label: '会话（轮次·步数）' },
  { key: 'timing', label: '计时（LLM·工具·TTFT）' },
  { key: 'elapsed', label: '用时' },
  { key: 'model', label: '模型' },
  { key: 'path', label: '路径' },
  { key: 'usage', label: '使用统计' },
  { key: 'cost', label: '费用' },
  { key: 'previousSession', label: '上一次会话' },
  { key: 'balance', label: '余额' },
]

/** Compact token count: 517 / 12.2K / 517K / 1.2M (one decimal under three digits). */
function formatTokens(n: number): string {
  const scaled = (v: number): string =>
    v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${scaled(n / 1_000)}K`
  return `${scaled(n / 1_000_000)}M`
}

/** Compact duration: 45.2s under a minute, 2m42s from there on. */
function formatDuration(ms: number): string {
  const s = ms / 1_000
  if (s < 60) return `${Math.round(s * 10) / 10}s`
  const whole = Math.round(s)
  return `${Math.floor(whole / 60)}m${whole % 60}s`
}

/** Sum the three disjoint prompt-side billing buckets. */
function billedInputTokens(usage: TokenUsageProjection): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/** Cache-hit share of prompt-side input, or null when no input was billed. */
function cacheHitPercent(usage: TokenUsageProjection): number | null {
  const denominator = billedInputTokens(usage)
  return denominator === 0
    ? null
    : Math.round(usage.cacheReadTokens / denominator * 100)
}

/** Approximate context occupancy, or null until both values are known. */
function contextOccupancy(pressure: ContextPressureProjection | undefined): {
  percent: number
  used: number
  window: number
} | null {
  const used = pressure?.projectedTokens ?? pressure?.pressureTokens
  if (used === undefined || pressure?.contextWindow === undefined) return null
  return {
    percent: Math.min(100, Math.round(used / pressure.contextWindow * 100)),
    used,
    window: pressure.contextWindow,
  }
}

/** Latest turn start time (ms epoch); 0 before the first turn. */
function latestTurnStart(turnTimings: ConversationSnapshot['turnTimings']): number {
  let max = 0
  for (const t of turnTimings.values()) if (t.startTime > max) max = t.startTime
  return max
}

/** Resolve the human-facing model name from a loaded directory state. */
function modelNameOf(state: ModelDirectoryState): string | null {
  if (state.current === null) return null
  const { provider, model } = state.current
  for (const group of state.groups) {
    if (group.id !== provider) continue
    const found = group.models.find(m => m.id === model)
    if (found !== undefined) return found.name
  }
  return model
}

/** The most recent non-current, non-blank session (上一次会话). */
function previousSessionOf(s: SessionListState): {
  title: string
  updatedAt: number
  input: number
  output: number
} | null {
  const current = s.current
  for (const id of s.ids) {
    if (id === current) continue
    const row = s.byId[id]
    if (row === undefined || row.blank) continue
    const usage = row.projectionValues?.tokenUsage
    return {
      title: row.displayTitle,
      updatedAt: row.updatedAt,
      input: usage !== undefined ? billedInputTokens(usage) : 0,
      output: usage?.outputTokens ?? 0,
    }
  }
  return null
}

/** Relative "…ago" label for a timestamp (ms epoch). */
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}

export const Hud = memo(function Hud({
  useSession, useSessions, useProjection, modelDirectory,
}: HudProps) {
  // ── data ────────────────────────────────────────────────────────────────
  const running = useSession(s => s.running)
  const streaming = useSession(s => s.partial !== null)
  const stats = useProjection('sessionStats')
  const usage = useProjection('tokenUsage')
  const pressure = useProjection('contextPressure')
  const turnStart = useSession(s => latestTurnStart(s.turnTimings))
  const cwd = useSessions(s => (s.current !== undefined ? s.byId[s.current]?.cwd : undefined))
  const previousSession = useSessions(previousSessionOf)

  // Model directory: subscribe to the shared per-session store (the same one
  // the composer model seat reads), falling back to a static empty snapshot.
  const subscribe = useCallback(
    (fn: () => void) => (modelDirectory !== undefined ? modelDirectory.subscribe(fn) : () => {}),
    [modelDirectory],
  )
  const getSnapshot = useCallback(
    () => (modelDirectory !== undefined ? modelDirectory.getSnapshot() : EMPTY_DIRECTORY),
    [modelDirectory],
  )
  const directoryState = useSyncExternalStore(subscribe, getSnapshot)
  const modelName = useMemo(() => modelNameOf(directoryState), [directoryState])

  // One-second ticker for the running elapsed clock (component-internal
  // behavioral hook — subscribes to nothing external).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { clearInterval(id) }
  }, [running])

  // ── config ──────────────────────────────────────────────────────────────
  const [config, setConfig] = useState<HudConfig>(loadConfig)
  const [configOpen, setConfigOpen] = useState(false)
  useEffect(() => subscribeConfig(() => { setConfig(loadConfig()) }), [])
  const applyConfig = (next: HudConfig): void => { setConfig(next); saveConfig(next) }
  const toggleCover = (): void => applyConfig({ ...config, coverStats: !config.coverStats })
  const toggleSection = (key: keyof HudSections): void => {
    applyConfig({ ...config, sections: { ...config.sections, [key]: !config.sections[key] } })
  }
  const setPricing = (key: keyof HudPricing, raw: string): void => {
    const value = Number.parseFloat(raw)
    if (!Number.isFinite(value) || value < 0) return
    applyConfig({ ...config, pricing: { ...config.pricing, [key]: value } })
  }

  // ── account balance (fetched from the host-half /dsh-hud/balance route) ──
  const [balance, setBalance] = useState<{ currency: string; total: string } | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/dsh-hud/balance')
      .then(r => r.json())
      .then((data: { ok?: boolean; balance?: { balance_infos?: { currency?: string; total_balance?: string }[] } }) => {
        if (cancelled || data.ok !== true) return
        const info = data.balance?.balance_infos?.[0]
        if (info !== undefined && info.total_balance !== undefined) {
          setBalance({ currency: info.currency ?? '', total: info.total_balance })
        }
      })
      .catch(() => { /* keep the segment hidden */ })
    return () => { cancelled = true }
  }, [])

  const elapsed = running && turnStart > 0 ? Math.max(0, now - turnStart) : 0
  const occupancy = useMemo(() => contextOccupancy(pressure), [pressure])
  const cost = useMemo(
    () => (usage === undefined ? null : computeCost(usage, config.pricing)),
    [usage, config.pricing],
  )

  let statusLabel = '空闲'
  let statusClass = 'dsh-hud-dot--idle'
  if (running) {
    if (streaming) {
      statusLabel = '输出中'
      statusClass = 'dsh-hud-dot--streaming'
    } else {
      statusLabel = '思考中'
      statusClass = 'dsh-hud-dot--running'
    }
  }

  const barClass = occupancy !== null
    ? occupancy.percent >= 90
      ? 'dsh-hud-bar-fill--danger'
      : occupancy.percent >= 75
        ? 'dsh-hud-bar-fill--warn'
        : 'dsh-hud-bar-fill'
    : 'dsh-hud-bar-fill'

  const hasTokens = usage !== undefined && (billedInputTokens(usage) > 0 || usage.outputTokens > 0)

  // 独有标记：HUD 徽标一眼看出内容是否已加载。
  const projectionsArrived = stats !== undefined || usage !== undefined || pressure !== undefined
  const modelLoading = directoryState.status === 'loading'
  let hudState: 'idle' | 'loading' | 'ready'
  let hudStateLabel: string
  if (projectionsArrived) {
    hudState = 'ready'
    hudStateLabel = '已就绪'
  } else if (running || modelLoading) {
    hudState = 'loading'
    hudStateLabel = '加载中'
  } else {
    hudState = 'idle'
    hudStateLabel = '空闲'
  }

  const s = config.sections

  // ── build the two rows' segments (config-gated) ─────────────────────────
  const row1: ReactNode[] = []
  if (s.status) {
    row1.push(
      <span className="dsh-hud-seg" key="status">
        <span className={`dsh-hud-dot ${statusClass}`} />
        <span className="dsh-hud-value">{statusLabel}</span>
      </span>,
    )
  }
  if (s.context && occupancy !== null) {
    row1.push(
      <span className="dsh-hud-seg" key="context" title={`上下文 ${occupancy.percent}%`}>
        <span className="dsh-hud-bar">
          <span className={barClass} style={{ width: `${occupancy.percent}%` }} />
        </span>
        <span className="dsh-hud-value">{occupancy.percent}%</span>
        <span className="dsh-hud-label">{formatTokens(occupancy.used)}/{formatTokens(occupancy.window)}</span>
      </span>,
    )
  }
  if (s.tokens && hasTokens) {
    row1.push(
      <span className="dsh-hud-seg" key="tokens">
        <span className="dsh-hud-label">令牌</span>
        <span className="dsh-hud-value">
          ↑{formatTokens(billedInputTokens(usage))} ↓{formatTokens(usage.outputTokens)}
        </span>
        {cacheHitPercent(usage) !== null && (
          <span className="dsh-hud-label">缓存{cacheHitPercent(usage)}%</span>
        )}
      </span>,
    )
  }
  if (s.session && stats !== undefined && stats.steps > 0) {
    row1.push(
      <span className="dsh-hud-seg" key="session">
        <span className="dsh-hud-label">会话</span>
        <span className="dsh-hud-value">{stats.turns} 轮 · {stats.steps} 步</span>
      </span>,
    )
  }
  if (s.timing && stats !== undefined && (stats.llmMs > 0 || stats.toolMs > 0 || stats.ttftSteps > 0)) {
    row1.push(
      <span className="dsh-hud-seg" key="timing">
        {stats.llmMs > 0 && (
          <span className="dsh-hud-metric">
            <span className="dsh-hud-label">LLM </span>
            <span className="dsh-hud-value">{formatDuration(stats.llmMs)}</span>
          </span>
        )}
        {stats.toolMs > 0 && (
          <span className="dsh-hud-metric">
            <span className="dsh-hud-label">工具 </span>
            <span className="dsh-hud-value">{formatDuration(stats.toolMs)}</span>
          </span>
        )}
        {stats.ttftSteps > 0 && (
          <span className="dsh-hud-metric">
            <span className="dsh-hud-label">TTFT </span>
            <span className="dsh-hud-value">{formatDuration(stats.ttftMs / stats.ttftSteps)}</span>
          </span>
        )}
      </span>,
    )
  }
  if (s.elapsed && running && elapsed > 0) {
    row1.push(
      <span className="dsh-hud-seg" key="elapsed">
        <span className="dsh-hud-label">用时</span>
        <span className="dsh-hud-value">{formatDuration(elapsed)}</span>
      </span>,
    )
  }

  const row2: ReactNode[] = []
  if (s.model && modelName !== null) {
    row2.push(
      <span className="dsh-hud-seg" key="model">
        <span className="dsh-hud-label">模型</span>
        <span className="dsh-hud-value">{modelName}</span>
      </span>,
    )
  }
  if (s.path && cwd !== undefined && cwd !== '') {
    row2.push(
      <span className="dsh-hud-seg" key="path" title={cwd}>
        <span className="dsh-hud-label">路径</span>
        <span className="dsh-hud-value dsh-hud-path">{cwd}</span>
      </span>,
    )
  }
  if (s.usage && hasTokens) {
    row2.push(
      <span className="dsh-hud-seg" key="usage" title={
        `未缓存 ${formatTokens(usage.uncachedInputTokens)} · 缓存读 ${formatTokens(usage.cacheReadTokens)} · 缓存写 ${formatTokens(usage.cacheWriteTokens)} · 输出 ${formatTokens(usage.outputTokens)}`
      }>
        <span className="dsh-hud-label">使用统计</span>
        <span className="dsh-hud-value">
          输入 {formatTokens(billedInputTokens(usage))} · 输出 {formatTokens(usage.outputTokens)}
        </span>
      </span>,
    )
  }
  if (s.cost && cost !== null) {
    row2.push(
      <span className="dsh-hud-seg" key="cost" title="估算费用（按单价 × 令牌量）">
        <span className="dsh-hud-label">费用</span>
        <span className="dsh-hud-value">{formatCost(cost)}</span>
      </span>,
    )
  }
  if (s.previousSession && previousSession !== null) {
    row2.push(
      <span className="dsh-hud-seg" key="previousSession">
        <span className="dsh-hud-label">上一次会话</span>
        <span className="dsh-hud-value dsh-hud-prev" title={previousSession.title}>
          {previousSession.title}
        </span>
        {previousSession.input > 0 && (
          <span className="dsh-hud-label">
            ↑{formatTokens(previousSession.input)} ↓{formatTokens(previousSession.output)}
          </span>
        )}
        <span className="dsh-hud-label">{formatRelativeTime(previousSession.updatedAt)}</span>
      </span>,
    )
  }
  if (s.balance && balance !== null) {
    row2.push(
      <span className="dsh-hud-seg" key="balance" title="账户余额（来自 DeepSeek /user/balance）">
        <span className="dsh-hud-label">余额</span>
        <span className="dsh-hud-value">{balance.currency} {balance.total}</span>
      </span>,
    )
  }

  return (
    <div className="dsh-hud" role="status" aria-live="polite">
      <div className="dsh-hud-row">
        <div className="dsh-hud-badge-wrap">
          <button
            type="button"
            className={`dsh-hud-badge dsh-hud-badge--${hudState}`}
            title={`HUD · ${hudStateLabel}（点击配置）`}
            aria-expanded={configOpen}
            onClick={() => { setConfigOpen(open => !open) }}
          >
            <span className="dsh-hud-badge-gear" aria-hidden>⚙</span>
            HUD
            <span className="dsh-hud-badge-dot" />
          </button>
          {configOpen && (
            <div className="dsh-hud-config" role="menu">
              <div className="dsh-hud-config-title">HUD 设置</div>
              <label className="dsh-hud-config-item">
                <input type="checkbox" checked={config.coverStats} onChange={toggleCover} />
                <span>覆盖内置统计行</span>
              </label>
              <div className="dsh-hud-config-sub">费用单价（¥/百万 token）</div>
              <label className="dsh-hud-config-item dsh-hud-config-pricing">
                <span>输入</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={config.pricing.input}
                  onChange={e => { setPricing('input', e.target.value) }}
                />
              </label>
              <label className="dsh-hud-config-item dsh-hud-config-pricing">
                <span>缓存读</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={config.pricing.cacheRead}
                  onChange={e => { setPricing('cacheRead', e.target.value) }}
                />
              </label>
              <label className="dsh-hud-config-item dsh-hud-config-pricing">
                <span>输出</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={config.pricing.output}
                  onChange={e => { setPricing('output', e.target.value) }}
                />
              </label>
              <div className="dsh-hud-config-sub">显示内容</div>
              {SECTION_ITEMS.map(item => (
                <label className="dsh-hud-config-item" key={item.key}>
                  <input
                    type="checkbox"
                    checked={config.sections[item.key]}
                    onChange={() => { toggleSection(item.key) }}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        {row1.map((seg, i) => (
          <Fragment key={i}>
            <span className="dsh-hud-divider" aria-hidden>|</span>
            {seg}
          </Fragment>
        ))}
      </div>

      {row2.length > 0 && (
        <div className="dsh-hud-row">
          {row2.map((seg, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="dsh-hud-divider" aria-hidden>|</span>}
              {seg}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
})
