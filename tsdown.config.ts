/**
 * Build config for dsh-hud, a third-party client plugin. It mirrors the
 * essentials of the harness `clientBundle` preset without depending on the
 * monorepo:
 *
 * - node half  → `lib/index.js` (ESM), imported by the host Loader.
 * - client half → `lib/client.js` (CJS, browser), wrapped in the
 *   `window.__ModuleLoader__.load({ id, factory })` handoff the shell's lazy
 *   CJS module table consumes. `require` resolves the platform modules
 *   (react, cordis, the ui-slots/… seed entries) from that table, so every
 *   @deepseek-ai specifier is external; everything else (this package's own
 *   code) is inlined.
 */
import type { UserConfig } from 'tsdown'

/** The module specifiers the browser shell shares into the frozen module table. */
const EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
] as const

const ID = 'dsh-hud'

/** Node-half library: the host imports this as the plugin's package root. */
const nodeHalf: UserConfig = {
  name: ID,
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2022',
  // ESM + `type: module` → emit `lib/index.js` (not `.mjs`).
  fixedExtension: false,
  dts: false,
  clean: false,
}

/** Browser-half bundle: fetched from /plugins/<id>/client.js and materialized lazily. */
const clientHalf: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  // `clean` must stay off: the client bundle lands next to the node half.
  clean: false,
  deps: {
    // Platform modules stay external (resolved from the loader module table)…
    neverBundle: [...EXTERNALS],
    // …and every other dependency inlines into this single bundle.
    alwaysBundle: (id: string) => (EXTERNALS.includes(id) ? undefined : true),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [nodeHalf, clientHalf]
