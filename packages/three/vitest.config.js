import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import path from 'path'

// Behaviour suite for the three extension, against the built artifact, in a
// real browser with WebGL and a real three.js. Outside the framework's
// 21-lane matrix on purpose: an extension is built and tested on its own.
//
//   node scripts/fetch-three.cjs            (once: three.js into tools/three/)
//   node scripts/build-rollup.cjs three.wf
//   npx vitest run --config packages/three/vitest.config.js
//   EXT_BUILD=min npx vitest run --config packages/three/vitest.config.js
//   node scripts/test-extension.cjs three  (every tier and build the manifest declares)
//
// EXT_BUILD: dev (default) or min. WF_CORE: the framework tier file on the
// page (default full.dev). WILDFLOWER_BROWSER: chromium (default), firefox, all.

const build = process.env.EXT_BUILD || 'dev'
if (build !== 'dev' && build !== 'min') throw new Error(`EXT_BUILD must be dev or min (got ${build})`)
const wfFile = build === 'min' ? '/packages/three/dist/three.wf.min.js' : '/packages/three/dist/three.wf.js'
const core = process.env.WF_CORE || '/www/js/dist/wildflower.full.dev.js'

const browser = process.env.WILDFLOWER_BROWSER || 'chromium'
const browserInstances = browser === 'all'
    ? [{ browser: 'chromium' }, { browser: 'firefox' }]
    : [{ browser }]

export default defineConfig({
  root: path.resolve(__dirname, '..', '..'),
  define: {
    __THREE_EXT_BUILD__: JSON.stringify(build),
    __THREE_EXT_FILE__: JSON.stringify(wfFile),
    __THREE_EXT_CORE__: JSON.stringify(core),
  },
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: browserInstances,
      headless: true,
    },
    include: ['packages/three/test/**/*.test.js'],
    testTimeout: 30000,
    isolate: true,
    globals: true,
  },
  publicDir: false,
})
