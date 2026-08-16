/**
 * User-configurable HUD settings, persisted to localStorage so they survive
 * reloads. Pure client-side store: apply() reads `coverStats` to decide whether
 * it shadows the built-in stats row, and the component reads `sections` to
 * decide which readouts render.
 */

export interface HudSections {
  status: boolean
  context: boolean
  tokens: boolean
  session: boolean
  timing: boolean
  elapsed: boolean
  model: boolean
  path: boolean
  usage: boolean
  cost: boolean
  previousSession: boolean
  balance: boolean
}

/** Cost pricing, in display currency per 1M tokens (editable by the user). */
export interface HudPricing {
  /** Uncached (cache-miss) prompt input. */
  input: number
  /** Cache-hit prompt input. */
  cacheRead: number
  /** Completion output. */
  output: number
}

export interface HudConfig {
  /** Replace the built-in composer stats row (same list cell, lower priority). */
  coverStats: boolean
  /** Which readout sections render. */
  sections: HudSections
  /** Per-model cost pricing (edit to match your deployment's real rates). */
  pricing: HudPricing
}

export const DEFAULT_CONFIG: HudConfig = {
  coverStats: false,
  sections: {
    status: true,
    context: true,
    tokens: true,
    session: true,
    timing: true,
    elapsed: true,
    model: true,
    path: true,
    usage: true,
    cost: true,
    previousSession: true,
    balance: true,
  },
  pricing: {
    input: 2,
    cacheRead: 0.5,
    output: 8,
  },
}

const STORAGE_KEY = 'dsh.hud.config'

/** Same-tab custom event (storage events already cover other tabs). */
const CHANGE_EVENT = 'dsh-hud-config-change'

/** Read the merged config (stored values over defaults). */
export function loadConfig(): HudConfig {
  if (typeof localStorage === 'undefined') return DEFAULT_CONFIG
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw) as Partial<HudConfig>
    return {
      coverStats: parsed.coverStats ?? DEFAULT_CONFIG.coverStats,
      sections: { ...DEFAULT_CONFIG.sections, ...(parsed.sections ?? {}) },
      pricing: { ...DEFAULT_CONFIG.pricing, ...(parsed.pricing ?? {}) },
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

/** Persist the config and notify live subscribers on this tab. */
export function saveConfig(next: HudConfig): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

/** Subscribe to config changes (same-tab event + cross-tab storage event). */
export function subscribeConfig(fn: () => void): () => void {
  const onStorage = (event: StorageEvent): void => { if (event.key === STORAGE_KEY) fn() }
  const onChange = (): void => fn()
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}
