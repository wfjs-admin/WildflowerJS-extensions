import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import path from 'path'

// Behaviour suite for the thread extension's vanilla file, against the built
// artifact, in a real browser with real Workers. Outside the framework's
// 21-lane matrix on purpose: an extension is built and tested on its own.
//
//   node scripts/build-rollup.cjs threads
//   npx vitest run --config packages/threads/vitest.config.js
//   THREADS_BUILD=min npx vitest run --config packages/threads/vitest.config.js
//   WILDFLOWER_BROWSER=firefox npx vitest run --config packages/threads/vitest.config.js
//
// THREADS_BUILD: dev (default, __DEV__ true, unminified) or min (mangled).
// WILDFLOWER_BROWSER: chromium (default), firefox, or all.

// EXT_BUILD and WF_CORE are the names the extensions CI sets for every
// package; THREADS_BUILD and THREADS_CORE are kept for use by hand.
const build = process.env.EXT_BUILD || process.env.THREADS_BUILD || 'dev'
if (build !== 'dev' && build !== 'min') throw new Error(`THREADS_BUILD must be dev or min (got ${build})`)
// The extension file under test.
const wfFile = build === 'min' ? '/packages/threads/dist/threads.wf.min.js' : '/packages/threads/dist/threads.wf.js'

// THREADS_CORE: the framework tier file the worker loads (a classic build).
// Default nano-min, the smallest tier with stores; any tier works.
const core = process.env.WF_CORE || process.env.THREADS_CORE || '/www/js/dist/wildflower.nano.min.js'

const browser = process.env.WILDFLOWER_BROWSER || 'chromium'
const browserInstances = browser === 'all'
    ? [{ browser: 'chromium' }, { browser: 'firefox' }]
    : [{ browser }]

export default defineConfig({
  root: path.resolve(__dirname, '..', '..'),
  define: {
    __THREADS_BUILD__: JSON.stringify(build),
    __THREADS_WF_FILE__: JSON.stringify(wfFile),
    __THREADS_CORE__: JSON.stringify(core),
  },
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: browserInstances,
      headless: true,
    },
    include: ['packages/threads/test/**/*.test.js'],
    testTimeout: 30000,
    isolate: true,
    globals: true,
  },
  publicDir: false,
})
