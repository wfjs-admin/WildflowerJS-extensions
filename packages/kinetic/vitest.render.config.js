import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import path from 'path'
import { flakyRoute } from './test/flaky-route.js'

// The render() suite runs in the installed Chrome rather than Playwright's
// headless shell: the shell has no WebCodecs, and drawElementImage (HTML
// in canvas) is behind a Chrome flag in 154. Everything else mirrors
// vitest.config.js.
//
//   node scripts/build-rollup.cjs kinetic.wf
//   npx vitest run --config packages/kinetic/vitest.render.config.js
//   EXT_BUILD=min npx vitest run --config packages/kinetic/vitest.render.config.js

const build = process.env.EXT_BUILD || 'dev'
if (build !== 'dev' && build !== 'min') throw new Error(`EXT_BUILD must be dev or min (got ${build})`)
const wfFile = build === 'min' ? '/packages/kinetic/dist/kinetic.wf.min.js' : '/packages/kinetic/dist/kinetic.wf.js'
const core = process.env.WF_CORE || '/www/js/dist/wildflower.full.dev.js'

export default defineConfig({
  root: path.resolve(__dirname, '..', '..'),
  // The test routes (test/flaky-route.js), for runtime.test.js's late-loading page.
  plugins: [flakyRoute(path.resolve(__dirname, '..', '..'))],
  define: {
    __KINETIC_EXT_BUILD__: JSON.stringify(build),
    __KINETIC_EXT_FILE__: JSON.stringify(wfFile),
    __KINETIC_EXT_CORE__: JSON.stringify(core),
  },
  test: {
    browser: {
      enabled: true,
      provider: playwright({ launchOptions: { channel: 'chrome', args: ['--enable-blink-features=CanvasDrawElement'] } }),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
    // runtime.test.js runs in the main suite too, where its render() tests skip.
    include: ['packages/kinetic/test/render.test.js', 'packages/kinetic/test/footage-render.test.js', 'packages/kinetic/test/lottie-render.test.js', 'packages/kinetic/test/lesson-render.test.js', 'packages/kinetic/test/runtime.test.js'],
    testTimeout: 60000,
    isolate: true,
    globals: true,
  },
  publicDir: false,
})
