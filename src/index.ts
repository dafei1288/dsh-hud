/**
 * dsh-hud host half: serves an account-balance endpoint the browser half
 * fetches. It resolves the DeepSeek API key through the credentials seam
 * (never exposing it to the client) and proxies DeepSeek's `/user/balance`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-host-webserver'

/** Required services: the webserver (ctx.webServer) to register the route. */
export const inject = ['webServer']

const BALANCE_URL = 'https://api.deepseek.com/user/balance'

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-hud/balance',
      handler: async (_req, res) => {
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        try {
          // Optional seam: absent when no credential provider is composed.
          const credentials = ctx.get('credentials')
          if (credentials === undefined) {
            res.end(JSON.stringify({ ok: false, reason: 'no-credentials' }))
            return
          }
          const credential = await credentials.resolve(credentialRef('DEEPSEEK_API_KEY'))
          if (credential === undefined || credential.value === '') {
            res.end(JSON.stringify({ ok: false, reason: 'no-key' }))
            return
          }
          const upstream = await fetch(BALANCE_URL, {
            headers: { authorization: `Bearer ${credential.value}` },
          })
          if (!upstream.ok) {
            res.end(JSON.stringify({ ok: false, reason: `http-${upstream.status}` }))
            return
          }
          res.end(JSON.stringify({ ok: true, balance: await upstream.json() }))
        } catch (error) {
          res.end(JSON.stringify({ ok: false, reason: error instanceof Error ? error.message : 'error' }))
        }
      },
    })
    return dispose
  }, 'dsh-hud: balance route')
}
