/**
 * The skill's scripts/check.cjs, run as the skill tells an assistant to run
 * it: a composition file is served from its folder, opened in headless
 * Chrome (Playwright's Chromium without it), waited on for readiness and
 * checked, its frames saved (--frames) and its lesson walked (--lesson), and
 * the script's exit code and output are what the assistant acts on.
 *
 * A Node test, not a browser one: check.cjs launches its own browser through
 * Playwright, which the browser-mode suite cannot spawn. The `.cjs` name keeps
 * it out of vitest.config.js (which takes *.test.js); run it with
 *
 *   node --test packages/kinetic/test/coverage-skill-check.test.cjs
 *
 * Each page lives in a temporary folder with copies of the framework's lite
 * development build and Kinetic's development build, so the KN warnings print.
 */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(ROOT, 'packages', 'kinetic', 'skills', 'wildflower-kinetic', 'scripts', 'check.cjs');
// The core from this repository's build, or, in the extensions repository,
// the published one its CI installs.
const CORE = [path.join(ROOT, 'www', 'js', 'dist', 'wildflower.lite.dev.js'), path.join(ROOT, 'node_modules', 'wildflowerjs', 'dist', 'wildflower.lite.dev.js')]
  .find((f) => require('fs').existsSync(f)) || path.join(ROOT, 'www', 'js', 'dist', 'wildflower.lite.dev.js');
const KINETIC = path.join(ROOT, 'packages', 'kinetic', 'dist', 'kinetic.wf.js');

let dir;

const page = (body, script) => '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' + body
  + '<script src="wildflower.lite.dev.js"></script><script src="kinetic.wf.js"></script><script>' + script + '</script></body></html>';

const ROOT_OPEN = '<div data-composition-id="main" data-start="0" data-duration="1" data-fps="10" data-width="320" data-height="180">';

const LESSON = '<div data-composition-id="main" data-start="0" data-duration="3" data-fps="10" data-width="320" data-height="180" style="width:320px;height:180px">'
  + '<div data-component="card" data-start="0" data-duration="3"><h1 data-bind-style="look">Hi</h1></div>'
  + '<section id="one" data-step data-start="0" data-duration="1"></section>'
  + '<section id="two" data-step data-start="one" data-duration="1"></section>'
  + '<section id="three" data-step data-start="two" data-duration="1"></section></div>';
const LESSON_SCRIPT = "wildflower.store('q', { state: { ok: false } });"
  + " wildflower.kinetic.step('one', { wait: 0.5 });"
  + " wildflower.kinetic.step('two', { wait: 0.5, until: 'q.ok', script: { 'q.ok': { at: [0, 0.8], set: [false, true] } } });"
  + " wildflower.kinetic.scene('card', { keyframes: { look: { opacity: { at: [0, 0.5], to: [0, 1] } } } });";

const PNG = (file) => fs.readFileSync(file).subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

const PAGES = {
  'reading.html': page('<div data-composition-id="main" data-start="0" data-duration="4" data-fps="10" data-width="320" data-height="180" style="position:relative;width:320px;height:180px">'
    + '<p data-start="0" data-duration="0.6" style="position:absolute;left:10px;top:10px;margin:0">Too quick for anyone to read this line</p>'
    + '<p data-start="0" data-duration="4" style="position:absolute;left:10px;top:80px;margin:0">Held <b>with</b> <i>its words</i></p>'
    + '<p data-start="1" data-duration="3" style="position:absolute;left:10px;top:130px;margin:0;opacity:0.5">Faint</p></div>', ''),
  'good.html': page(ROOT_OPEN + '<div data-component="card" data-start="0"><h1 data-bind-style="look">Hi</h1></div></div>',
    "wildflower.kinetic.scene('card', { keyframes: { look: { opacity: { at: [0, 0.5], to: [0, 1] } } } });"),
  'random.html': page(ROOT_OPEN + '<div data-component="noisy" data-start="0"><b data-bind="n"></b></div></div>',
    "wildflower.kinetic.scene('noisy', { computed: { n() { return this.local >= 0 ? String(Math.random()) : ''; } } });"),
  'anim.html': '<style>@keyframes up { from { opacity: 0 } to { opacity: 1 } }</style>'
    + page(ROOT_OPEN + '<div data-component="anim" data-start="0"><i style="animation: up 2s linear"></i></div></div>', "wildflower.kinetic.scene('anim', {});"),
  'noroot.html': page('<p>nothing to render</p>', ''),
  'failed.html': page(ROOT_OPEN + '<div data-component="needs" data-start="0"></div></div>',
    "wildflower.kinetic.scene('needs', { inputs: { price: { type: Number, required: true } } });"),
  'throws.html': page(ROOT_OPEN + '<div data-component="broken" data-start="0"><b data-bind="label"></b></div></div>',
    "wildflower.kinetic.scene('broken', { computed: { label() { if (this.local > 0.25) throw new Error('label broke'); return 'ok'; } } });"),
  // The README's pattern for a lesson: keyframes for the video, tick(dt) for
  // what the page does live while a step waits.
  'tick.html': page(ROOT_OPEN + '<div data-component="bowl" data-start="0"><h1 data-bind-style="look">Hi</h1></div></div>',
    "wildflower.kinetic.scene('bowl', { keyframes: { look: { opacity: { at: [0, 0.5], to: [0, 1] } } }, tick(dt) { if (this.stores.kinetic.waiting) this.spin = (this.spin || 0) + dt; } });"),
  // A lesson of three steps, the second waiting on an until nothing answers.
  'lesson.html': page(LESSON, LESSON_SCRIPT),
  // The same, with a console error as the second step is entered.
  'lesson-error.html': page(LESSON, LESSON_SCRIPT + " document.addEventListener('kinetic:step', (e) => { if (e.detail.step === 'two') console.error('two went wrong'); });"),
  // The same console error from every seek, and one other error once.
  'repeat.html': page(ROOT_OPEN + '<div data-component="loud" data-start="0"></div></div>',
    "console.error('once only'); wildflower.kinetic.scene('loud', { seek() { console.error('drawn badly'); } });"),
  // A KN line that reaches the console as an Error object, so its text starts with "Error: ".
  'errobj.html': page(ROOT_OPEN + '<div data-component="card" data-start="0"><h1 data-bind-style="look">Hi</h1></div></div>',
    "console.error(new Error('[KN-130] made up for the test')); wildflower.kinetic.scene('card', { keyframes: { look: { opacity: { at: [0, 0.5], to: [0, 1] } } } });"),
  // Errors outside check()'s seeks, which its report does not count: an
  // uncaught throw and an unhandled rejection at load.
  'late-throw.html': page(ROOT_OPEN + '<div data-component="card" data-start="0"><h1 data-bind-style="look">Hi</h1></div></div>',
    "wildflower.kinetic.scene('card', { keyframes: { look: { opacity: { at: [0, 0.5], to: [0, 1] } } } }); setTimeout(() => { throw new Error('thrown after load'); }, 0);"),
  'late-reject.html': page(ROOT_OPEN + '<div data-component="card" data-start="0"><h1 data-bind-style="look">Hi</h1></div></div>',
    "wildflower.kinetic.scene('card', { keyframes: { look: { opacity: { at: [0, 0.5], to: [0, 1] } } } }); Promise.reject(new Error('rejected at load'));"),
  // An author's own console error at load: printed, and not a failure.
  'own-error.html': page(ROOT_OPEN + '<div data-component="card" data-start="0"><h1 data-bind-style="look">Hi</h1></div></div>',
    "console.error('my own message'); wildflower.kinetic.scene('card', { keyframes: { look: { opacity: { at: [0, 0.5], to: [0, 1] } } } });"),
};
// A console error at load in each of the forms the framework and its
// extensions print, outside check()'s seeks.
const FRAMEWORK_ERRORS = ['[WF-238] Reactive updates did not settle', '[WildflowerJS] Error in computed property', '[WF] Store write failed', '[Wildflower] Invalid binding', '[TH-101] a Threads error', '[3D-102] a Trillium error'];
FRAMEWORK_ERRORS.forEach((m, i) => {
  PAGES['framework-' + i + '.html'] = page(ROOT_OPEN + '<div data-component="card" data-start="0"><h1 data-bind-style="look">Hi</h1></div></div>',
    'console.error(' + JSON.stringify(m) + "); wildflower.kinetic.scene('card', { keyframes: { look: { opacity: { at: [0, 0.5], to: [0, 1] } } } });");
});

function check(...args) {
  return run(SCRIPT, dir, ...args);
}

function run(script, cwd, ...args) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 90000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const reportOf = (out) => JSON.parse((/^check: (.*)$/m.exec(out) || [])[1] || 'null');

describe('the skill\'s check.cjs', () => {
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kinetic-check-'));
    fs.copyFileSync(CORE, path.join(dir, 'wildflower.lite.dev.js'));
    fs.copyFileSync(KINETIC, path.join(dir, 'kinetic.wf.js'));
    for (const [name, html] of Object.entries(PAGES)) fs.writeFileSync(path.join(dir, name), html);
    // A folder beside the served one whose name starts with its name, and a
    // page that asks the server for a file in it.
    fs.mkdirSync(dir + '-x');
    fs.writeFileSync(path.join(dir + '-x', 'secret.txt'), 'top secret');
    fs.writeFileSync(path.join(dir, 'sibling.html'), page(ROOT_OPEN + '<div data-component="card" data-start="0"><h1 data-bind-style="look">Hi</h1></div></div>',
      "fetch('/..%2f" + path.basename(dir) + "-x%2fsecret.txt').then((r) => r.text()).then((t) => console.error('served: ' + t));"
      + " wildflower.kinetic.scene('card', { keyframes: { look: { opacity: { at: [0, 0.5], to: [0, 1] } } } });"));
  });
  after(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    if (dir) fs.rmSync(dir + '-x', { recursive: true, force: true });
  });

  it('a deterministic composition: exit 0, the report ok, no KN lines', () => {
    const r = check('good.html');
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(reportOf(r.out), { ok: true, frames: 10, samples: 10, ready: 'true', errors: 0 });
    assert.match(r.out, /console: no KN lines, no errors/);
  });

  it('the reading pass lists a block that leaves before it can be read, with its words and times; one held long enough, inline parts and all, and a faint one are not listed; exit 0; --no-reading skips it', () => {
    const r = check('reading.html');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^reading: 1 block of text leaves before it can be read/m);
    assert.match(r.out, /^ {2}"Too quick for anyone to read this line" \(8 words\): 0\.6 s from 0\.0 s, needs 3\.5 s$/m);
    assert.doesNotMatch(r.out, /Held|Faint/);
    const off = check('reading.html', '--no-reading');
    assert.equal(off.code, 0, off.out);
    assert.doesNotMatch(off.out, /^reading:/m);
  });

  it('an option before the page is read as an option, not as the page', () => {
    const r = check('--samples', '4', 'good.html');
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(reportOf(r.out), { ok: true, frames: 10, samples: 4, ready: 'true', errors: 0 });
  });

  it('a computed that throws on some frames: exit 1, the report says a seek threw with the first message, and KN-160 is printed', () => {
    const r = check('throws.html', '--samples', '10');
    assert.equal(r.code, 1, r.out);
    const report = reportOf(r.out);
    assert.equal(report.ok, false);
    assert.equal(report.reason, 'a seek threw');
    assert.ok(report.errors > 0, r.out);
    assert.match(report.firstError, /label broke/);
    assert.match(r.out, /\[KN-160\] check\(\): \d+ errors? during the seeks; the first: /);
  });

  it('Math.random() in a computed: exit 1, the report names the frame, and KN-141 and KN-160 are printed with their suggestions', () => {
    const r = check('random.html', '--samples', '5');
    assert.equal(r.code, 1, r.out);
    const report = reportOf(r.out);
    assert.equal(report.ok, false);
    assert.equal(report.property, 'text');
    assert.match(r.out, /\[KN-141\] Math\.random\(\) was called during a seek/);
    assert.match(r.out, /\[KN-160\] check\(\): frame \d+/);
    assert.match(r.out, /↳ Suggestion: Use wildflower\.kinetic\.random\(seed\)/);
  });

  it('a CSS animation Kinetic positions on every seek prints nothing: exit 0, no KN lines', () => {
    const r = check('anim.html', '--samples', '5');
    assert.equal(r.code, 0, r.out);
    assert.equal(reportOf(r.out).ok, true);
    assert.match(r.out, /console: no KN lines, no errors/);
  });

  it('no composition root: exit 1 and says so', () => {
    const r = check('noroot.html');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /No composition root: the page has no element with data-composition-id\./);
  });

  it('readiness that fails: exit 1, the KN line that says why is printed, and the report says readiness failed', () => {
    const r = check('failed.html');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /Readiness failed\. The KN line below says why\./);
    assert.match(r.out, /\[KN-130\] scene 'needs' input 'price': is required/);
    const report = reportOf(r.out);
    assert.equal(report.ok, false);
    assert.equal(report.reason, 'readiness failed');
    assert.equal(report.ready, 'failed');
  });

  it('a lesson scene with tick() passes: check() makes no video, so KN-151 stays quiet; exit 0', () => {
    const r = check('tick.html', '--samples', '5');
    assert.equal(r.code, 0, r.out);
    assert.equal(reportOf(r.out).ok, true);
    assert.doesNotMatch(r.out, /KN-151/);
  });

  it('a KN line logged as an Error object counts as a KN line: exit 1', () => {
    const r = check('errobj.html', '--samples', '5');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /\[KN-130\] made up for the test/);
  });

  it('the server answers nothing outside its root, even in a folder whose name starts with the root\'s', () => {
    const r = check('sibling.html', '--samples', '5');
    assert.match(r.out, /served: /, r.out);
    assert.doesNotMatch(r.out, /top secret/);
  });

  it('a value for --timeout or --samples that is no positive number: exit 2 and says which', () => {
    let r = check('good.html', '--timeout', 'abc');
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /--timeout/);
    r = check('good.html', '--samples', '0');
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /--samples/);
  });

  it('copied out of the package (into a user-wide skills folder), it finds Playwright from the folder it is run in', () => {
    const away = fs.mkdtempSync(path.join(os.tmpdir(), 'kinetic-skill-'));
    try {
      const copy = path.join(away, 'check.cjs');
      fs.copyFileSync(SCRIPT, copy);
      const r = run(copy, ROOT, path.join(dir, 'good.html'));
      assert.equal(r.code, 0, r.out);
      assert.equal(reportOf(r.out).ok, true);
    } finally {
      fs.rmSync(away, { recursive: true, force: true });
    }
  });

  it('says which browser ran: the installed Chrome, or Playwright\'s Chromium without it', () => {
    const r = check('good.html', '--samples', '2');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^browser: (Chrome|Playwright's Chromium) \d+/m);
  });

  it('--frames with times saves a PNG of the root at each, snapped to its frame, into --out, and prints the paths', () => {
    const out = path.join(dir, 'shots');
    const r = check('good.html', '--samples', '2', '--frames', '0,0.5', '--out', out);
    assert.equal(r.code, 0, r.out);
    const files = ['frame-0000-0.000s.png', 'frame-0005-0.500s.png'];
    assert.deepEqual(fs.readdirSync(out).sort(), files);
    for (const f of files) {
      assert.ok(PNG(path.join(out, f)), f + ' is a PNG');
      assert.ok(r.out.includes(path.join(out, f)), 'the path of ' + f + ' is printed');
    }
  });

  it('--frames with a count saves that many evenly spaced frames, from 0 to the last frame, into frames/ beside the page', () => {
    const r = check('good.html', '--samples', '2', '--frames', '3');
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'frames')).sort(), ['frame-0000-0.000s.png', 'frame-0005-0.500s.png', 'frame-0009-0.900s.png']);
    fs.rmSync(path.join(dir, 'frames'), { recursive: true, force: true });
  });

  it('a value for --frames that is no list of times and no count: exit 2', () => {
    for (const v of ['abc', '0', '1,-2']) {
      const r = check('good.html', '--frames', v);
      assert.equal(r.code, 2, v + ': ' + r.out);
      assert.match(r.out, /--frames/);
    }
  });

  it('--lesson walks the steps with go(): each holds, the one waiting on its until names the path, a still of each, exit 0; the reading pass reads the lesson as its video first', () => {
    const out = path.join(dir, 'lesson-shots');
    const r = check('lesson.html', '--samples', '5', '--lesson', '--out', out);
    assert.equal(r.code, 0, r.out);
    assert.equal(reportOf(r.out).ok, true);
    assert.match(r.out, /^reading: every block of text stays on screen long enough to read$/m);
    assert.match(r.out, /^lesson: 3 steps$/m);
    assert.match(r.out, /^ {2}1 one: held at 0\.4\d* s, the last frame before its wait$/m);
    assert.match(r.out, /^ {2}2 two: held at 1\.4\d* s, the last frame before its wait; waits on until q\.ok$/m);
    assert.match(r.out, /^ {2}3 three: held at 2\.9\d* s, the last frame before its wait$/m);
    const files = fs.readdirSync(out).sort();
    assert.deepEqual(files, ['step-01-one.png', 'step-02-two.png', 'step-03-three.png']);
    for (const f of files) assert.ok(PNG(path.join(out, f)), f + ' is a PNG');
  });

  // The site's demo of the skill's lesson layout (patterns.md, "A lesson's
  // layout"), copied beside the development builds, walked as the skill
  // tells an assistant to walk a lesson. The demo is on the main site, absent
  // from the extensions repository, where this test skips.
  const LESSON_DEMO = path.join(ROOT, 'www', 'demos', 'kinetic-lesson-layout');
  it("--lesson: the lesson-layout demo passes, both steps hold, and the question waits on its until", { skip: !fs.existsSync(LESSON_DEMO) && 'the main site\'s lesson-layout demo is not in this repository' }, () => {
    const demo = LESSON_DEMO;
    const layout = path.join(dir, 'layout');
    fs.mkdirSync(layout, { recursive: true });
    fs.copyFileSync(CORE, path.join(layout, 'wildflower.lite.dev.js'));
    fs.copyFileSync(KINETIC, path.join(layout, 'kinetic.wf.js'));
    fs.copyFileSync(path.join(demo, 'lesson.js'), path.join(layout, 'lesson.js'));
    const html = fs.readFileSync(path.join(demo, 'index.html'), 'utf8')
      .replace('<script defer src="/js/analytics.js"></script>', '')
      .replace('/js/dist/wildflower.lite.min.js', 'wildflower.lite.dev.js')
      .replace('/js/extensions/kinetic.wf.min.js', 'kinetic.wf.js');
    fs.writeFileSync(path.join(layout, 'index.html'), html);
    const r = run(SCRIPT, layout, 'index.html', '--samples', '10', '--lesson', '--out', path.join(layout, 'shots'));
    assert.equal(r.code, 0, r.out);
    assert.equal(reportOf(r.out).ok, true);
    assert.doesNotMatch(r.out, /\[KN-/);
    assert.match(r.out, /^lesson: 2 steps$/m);
    assert.match(r.out, /^ {2}1 grow: held at [\d.]+ s, the last frame before its wait$/m);
    assert.match(r.out, /^ {2}2 ask: held at [\d.]+ s, the last frame before its wait; waits on until area\.right$/m);
  });

  it('--lesson: a console error during a step is listed under it, exit 1', () => {
    const r = check('lesson-error.html', '--samples', '5', '--lesson', '--out', path.join(dir, 'lesson-shots-2'));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /^ {2}2 two: held at [\d.]+ s, the last frame before its wait; waits on until q\.ok\n {4}still: .*\n {4}error: two went wrong$/m);
  });

  it('an error that comes again from many seeks, the same message and stack, is printed once with its count; a different error is printed apart', () => {
    const r = check('repeat.html', '--samples', '10');
    assert.equal(r.code, 1, r.out);
    const lines = r.out.split('\n').filter((l) => l.startsWith('  error: '));
    const same = lines.filter((l) => l.startsWith('  error: drawn badly'));
    assert.equal(same.length, 1, r.out);
    assert.match(same[0], / × \d+$/);
    // Two passes of 10 seeks, at least.
    assert.ok(Number(/ × (\d+)$/.exec(same[0])[1]) >= 20, same[0]);
    assert.deepEqual(lines.filter((l) => l.startsWith('  error: once only')), ['  error: once only'], r.out);
  });

  it('an uncaught error or an unhandled rejection at any time in the run, outside the seeks: exit 1, the report ok, the page error printed', () => {
    for (const [file, message] of [['late-throw.html', 'thrown after load'], ['late-reject.html', 'rejected at load']]) {
      const r = check(file, '--samples', '5');
      assert.equal(r.code, 1, file + '\n' + r.out);
      assert.equal(reportOf(r.out).ok, true, file + ': check() counts only its seeks');
      assert.match(r.out, new RegExp('^ {2}page error: .*' + message, 'm'), file);
      assert.match(r.out, /^Failed: an error outside the seeks/m, file);
    }
  });

  it("a console error in the framework's or an extension's own form, outside the seeks: exit 1", () => {
    FRAMEWORK_ERRORS.forEach((m, i) => {
      const r = check('framework-' + i + '.html', '--samples', '5');
      assert.equal(r.code, 1, m + '\n' + r.out);
      assert.ok(r.out.includes('  error: ' + m), m + '\n' + r.out);
    });
  });

  it("an author's own console error at load is printed and does not fail the run: exit 0", () => {
    const r = check('own-error.html', '--samples', '5');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^ {2}error: my own message$/m);
  });

  it('--lesson on a page with no steps: says so, exit 1', () => {
    const r = check('good.html', '--samples', '2', '--lesson');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /lesson: the page has no steps/);
  });

  it('a page that does not exist: exit 2', () => {
    const r = check('nothing-here.html');
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /no such file: .*nothing-here\.html/);
  });
});
