/**
 * dsh-hud browser half: a pi-agent-hud-style live status bar mounted in the
 * composer dock (the ambient readout band under the composer card). It reads
 * the durable whole-log projections, the session list, and the optional model
 * directory, so every figure survives paging and compaction.
 */
import type { ClientContext, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pull the 'conversation.composer.dock' SlotMap key (declared by
// ui-conversation; the client bundle erases this import, so it never reaches
// the module table).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pull the projection keys the HUD reads (sessionStats / tokenUsage
// / contextPressure).
import type {} from '@deepseek-ai/dsh-session-stats/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'
// Type-only: ModelDirectoryState for the store type; ModelDirectoryResolver
// also forces the `modelDirectories` Context augmentation (declared in that
// package's service module) into this compilation unit.
import type { ModelDirectoryResolver, ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { Hud } from './Hud.tsx'
import { hudCss } from './hud-css.ts'
import { loadConfig, subscribeConfig } from './config.ts'

/** Required services: the slot registry (ctx.slots) is all this surface needs. */
export const inject = ['slots']

const STYLE_TAG_ID = 'dsh-hud-styles'

/**
 * Browser plugin body: inject one theme-aware stylesheet (removed on unload),
 * then mount the HUD into the composer dock. `slots.inject` waits on the slot
 * declaration and unregisters the entry when that declaration collapses.
 *
 * The registration re-runs when the user toggles `coverStats`, so the choice
 * to shadow the built-in stats row (same `id` cell, lower `priority`) takes
 * effect without a reload.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    if (typeof document !== 'undefined') {
      let tag = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${STYLE_TAG_ID}"]`)
      if (tag === null) {
        tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-hud'
        tag.dataset.pluginCss = STYLE_TAG_ID
        tag.textContent = hudCss
        document.head.appendChild(tag)
      }
      return () => { tag?.remove() }
    }
  }, 'dsh-hud: stylesheet')

  ctx.effect(() => {
    let disposeHud: () => void = () => {}
    let lastCover = loadConfig().coverStats

    const mount = (): void => {
      disposeHud()
      disposeHud = ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        // Shadow the built-in stats row when configured: this list slot renders
        // one entry per `id` cell, and the lowest `priority` wins. Using the
        // shipped cell (`id: 'stats'`) at a lower priority replaces
        // ui-conversation's StatsLine; otherwise the HUD registers beside it.
        id: lastCover ? 'stats' : 'hud',
        ...(lastCover ? { priority: -1 } : {}),
        order: -10,
        inject: (sessionId): { modelDirectory?: SnapshotStore<ModelDirectoryState> } => {
          try {
            // Optional service: absent when ui-model-selection is composed out.
            const models = ctx.get('modelDirectories') as ModelDirectoryResolver | undefined
            if (models === undefined) return {}
            const directory = models.directoryFor(sessionId)
            // Populate the shared directory once if nothing loaded it yet (the
            // same RPC the model menu issues); the store then updates reactively.
            if (directory.store.getSnapshot().status === 'idle') {
              void directory.load().catch(() => { /* surfaced on the store */ })
            }
            return { modelDirectory: directory.store }
          } catch {
            return {}
          }
        },
      }, Hud))
    }

    mount()
    // Only a coverStats flip needs a re-mount (it changes the slot cell).
    // Section toggles are reactive inside the component and must not re-register.
    const unsubscribe = subscribeConfig(() => {
      const next = loadConfig()
      if (next.coverStats === lastCover) return
      lastCover = next.coverStats
      mount()
    })
    return () => { unsubscribe(); disposeHud() }
  }, 'dsh-hud: register')
}
