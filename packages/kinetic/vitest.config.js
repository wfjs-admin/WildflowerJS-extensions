import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import path from 'path'
import { flakyRoute } from './test/flaky-route.js'

// Behaviour suite for the Kinetic extension, against the built artifact, in a
// real browser. Outside the framework's 21-lane matrix on purpose: an
// extension is built and tested on its own.
//
//   node scripts/build-rollup.cjs kinetic.wf
//   npx vitest run --config packages/kinetic/vitest.config.js
//   EXT_BUILD=min npx vitest run --config packages/kinetic/vitest.config.js
//   node scripts/test-extension.cjs kinetic  (every tier and build the manifest declares)
//
// EXT_BUILD: dev (default) or min. WF_CORE: the framework tier file on the
// page (default full.dev). WILDFLOWER_BROWSER: chromium (default), firefox, all.
// WILDFLOWER_BROWSER_CHANNEL: a Playwright channel such as chrome, to run in
// the installed Google Chrome, the browser Kinetic renders in. The extensions
// repository's CI sets it: Linux Chromium has no AAC encoder.

const build = process.env.EXT_BUILD || 'dev'
const channel = process.env.WILDFLOWER_BROWSER_CHANNEL
if (build !== 'dev' && build !== 'min') throw new Error(`EXT_BUILD must be dev or min (got ${build})`)
const wfFile = build === 'min' ? '/packages/kinetic/dist/kinetic.wf.min.js' : '/packages/kinetic/dist/kinetic.wf.js'
const core = process.env.WF_CORE || '/www/js/dist/wildflower.full.dev.js'

const browser = process.env.WILDFLOWER_BROWSER || 'chromium'
const browserInstances = browser === 'all'
    ? [{ browser: 'chromium' }, { browser: 'firefox' }]
    : [{ browser }]

export default defineConfig({
  root: path.resolve(__dirname, '..', '..'),
  // A file that 404s and is then put on the server (readiness-recovery.test.js).
  plugins: [flakyRoute(path.resolve(__dirname, '..', '..'))],
  define: {
    __KINETIC_EXT_BUILD__: JSON.stringify(build),
    __KINETIC_EXT_FILE__: JSON.stringify(wfFile),
    __KINETIC_EXT_CORE__: JSON.stringify(core),
  },
  test: {
    browser: {
      enabled: true,
      provider: playwright(channel ? { launchOptions: { channel } } : undefined),
      instances: browserInstances,
      headless: true,
    },
    include: ['packages/kinetic/test/**/*.test.js'],
    // render() needs the installed Chrome (WebCodecs, HTML in canvas):
    // vitest.render.config.js runs those.
    exclude: ['packages/kinetic/test/render.test.js', 'packages/kinetic/test/footage-render.test.js', 'packages/kinetic/test/lottie-render.test.js', 'packages/kinetic/test/lesson-render.test.js'],
    testTimeout: 30000,
    // On CI (two cores) the files run one at a time: the live-playback tests
    // time a playing <video> against the clock, and with every file's tab
    // decoding at once the footage falls behind for want of CPU.
    fileParallelism: !process.env.CI,
    isolate: true,
    globals: true,
  },
  publicDir: false,
})
