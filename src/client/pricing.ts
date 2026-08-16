/**
 * Cost estimation for the HUD. DSH carries token usage but no pricing data,
 * so the HUD multiplies the durable `tokenUsage` buckets by the user-configured
 * per-model rates (edit them in the HUD config panel). Rates are in the display
 * currency per 1M tokens.
 */
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import type { HudPricing } from './config.ts'

/** Display currency prefix for {@link formatCost}. */
export const CURRENCY = '¥'

/**
 * Total estimated cost of a session's durable token usage. The three prompt
 * buckets are disjoint: uncached input bills at the input rate, cache reads at
 * the (cheaper) read rate, and cache writes at the input rate (DeepSeek
 * reports no cache-write metric, so that term is normally zero).
 * @param usage - the `tokenUsage` projection value.
 * @param pricing - user-configured per-1M-token rates.
 * @returns cost in the display currency.
 */
export function computeCost(usage: TokenUsageProjection, pricing: HudPricing): number {
  return (
    usage.uncachedInputTokens * pricing.input
    + usage.cacheReadTokens * pricing.cacheRead
    + usage.cacheWriteTokens * pricing.input
    + usage.outputTokens * pricing.output
  ) / 1_000_000
}

/** Format a cost with enough precision for small values. */
export function formatCost(cost: number): string {
  if (cost <= 0) return `${CURRENCY}0`
  if (cost < 0.01) return `${CURRENCY}${cost.toFixed(4)}`
  if (cost < 1) return `${CURRENCY}${cost.toFixed(3)}`
  return `${CURRENCY}${cost.toFixed(2)}`
}
