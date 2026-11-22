/**
 * check.cjs, the Node script, started from a command line: a
 * composition file is served from its folder, opened in headless
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
const SCRIPT = path.join(ROOT, 'packages', 'kinetic', 'scripts', 'check.cjs');
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

const slide = (left, pop) => page('<div data-composition-id="main" data-start="0" data-duration="2" data-fps="10" data-width="320" data-height="180" style="position:relative;width:320px;height:180px;background:#111">'
  + '<div data-component="mover" data-start="0" data-duration="2" style="position:absolute;inset:0"><i id="slider" data-bind-style="box"></i>'
  + (pop ? '<b id="pop" data-bind-style="flash"></b>' : '') + '</div></div>',
  "wildflower.kinetic.scene('mover', { computed: { box() { return { position: 'absolute', top: '70px', width: '40px', height: '40px', background: '#eee', left: (" + left + ") + 'px' }; },"
  + " flash() { return { position: 'absolute', left: '200px', top: '20px', width: '80px', height: '80px', background: '#fff', display: this.clipFrame === 10 ? 'block' : 'none' }; } } });");

const PNG = (file) => fs.readFileSync(file).subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

const PAGES = {
  'reading.html': page('<div data-composition-id="main" data-start="0" data-duration="4" data-fps="10" data-width="320" data-height="180" style="position:relative;width:320px;height:180px">'
    + '<p data-start="0" data-duration="0.6" style="position:absolute;left:10px;top:10px;margin:0">Too quick for anyone to read this line</p>'
    + '<p data-start="0" data-duration="4" style="position:absolute;left:10px;top:80px;margin:0">Held <b>with</b> <i>its words</i></p>'
    + '<p data-start="1" data-duration="3" style="position:absolute;left:10px;top:130px;margin:0;opacity:0.5">Faint</p></div>', ''),
  // Two lines typed from 1 s and whole at 3 s: one is gone at 4 s, the other
  // stays to 5 s.
  'typed.html': page('<div data-composition-id="main" data-start="0" data-duration="5" data-fps="10" data-width="320" data-height="180" style="position:relative;width:320px;height:180px">'
    + '<div data-component="typed" data-start="1" data-duration="3" style="position:absolute;left:10px;top:30px"><p style="margin:0;white-space:nowrap" data-bind="line"></p></div>'
    + '<div data-component="typed" data-start="1" data-duration="4" style="position:absolute;left:10px;top:100px"><p style="margin:0;white-space:nowrap" data-bind="line"></p></div></div>',
    "wildflower.kinetic.scene('typed', { computed: { line() { return wildflower.kinetic.typewriter(this.local, 'one two three four', 9); } } });"),
  // The layout pass: a line in the margin, one past the edge, two titles
  // over each other for 1 s and two for 0.2 s, gray text under 4.5:1 and
  // the same gray at 50 px over 3:1, white over a ramp to light gray, and a
  // line in the margin under an opaque card, which is not seen.
  'layout.html': page('<style>p{position:absolute;margin:0;font:16px sans-serif;color:#111;white-space:nowrap}</style>'
    + '<div data-composition-id="main" data-start="0" data-duration="3" data-fps="10" data-width="320" data-height="180" style="position:relative;width:320px;height:180px;background:#fff;overflow:hidden">'
    + '<p style="left:6px;top:20px">In the margin</p>'
    + '<p style="left:250px;top:20px">Off the edge</p>'
    + '<p data-start="0" data-duration="1" style="left:40px;top:60px">First title</p>'
    + '<p data-start="0" data-duration="1" style="left:60px;top:64px">Second title</p>'
    + '<p data-start="1.5" data-duration="0.2" style="left:200px;top:60px">Brief one</p>'
    + '<p data-start="1.5" data-duration="0.2" style="left:210px;top:62px">Brief two</p>'
    + '<p style="left:40px;top:100px;color:#888">Small gray</p>'
    + '<p style="left:140px;top:90px;color:#888;font-size:50px">Big</p>'
    + '<p style="left:40px;top:140px;color:#fff;padding:0 4px;background:linear-gradient(90deg,#000,#ddd)">White on a ramp</p>'
    + '<p style="left:200px;top:140px">Fine text</p>'
    + '<p style="left:4px;top:160px">Under the card</p><i style="position:absolute;left:0;top:156px;width:150px;height:24px;background:#fff"></i></div>', ''),
  // A ground that cuts from dark to light at 1 s: one snap in 2 s.
  'pace.html': page('<div data-composition-id="main" data-start="0" data-duration="2" data-fps="10" data-width="320" data-height="180" style="width:320px;height:180px">'
    + '<div data-component="ground" data-start="0" data-duration="2" style="position:absolute;inset:0" data-bind-style="fill"></div></div>',
    "wildflower.kinetic.scene('ground', { computed: { fill() { return { background: this.clipFrame < 10 ? '#111111' : '#eeeeee' }; } } });"),
  // A light square sliding on a dark ground for 2 s: on, a whole run that
  // jumps back at the loop; round, a swing that closes; pop, the slide with
  // a large square shown on frame 10 alone.
  'seam-bad.html': slide('140 * this.local / 2'),
  'seam-good.html': slide('140 + 60 * Math.sin(2 * Math.PI * this.local / 2)'),
  'pop.html': slide('140 * this.local / 2', true),
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
    const r = check('reading.html', '--no-layout');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^reading: 1 block of text leaves before it can be read/m);
    assert.match(r.out, /^ {2}"Too quick for anyone to read this line" \(8 words\): 0\.6 s from 0\.0 s, needs 3\.5 s$/m);
    assert.doesNotMatch(r.out, /Held|Faint/);
    const off = check('reading.html', '--no-reading');
    assert.equal(off.code, 0, off.out);
    assert.doesNotMatch(off.out, /^reading:/m);
  });

  it('the reading pass counts typed text from its first letter, and lists a line that is whole for under 1.5 s as whole for that long; one whole for longer is not listed', () => {
    const r = check('typed.html', '--no-layout');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^reading: 1 block of text leaves before it can be read/m);
    assert.match(r.out, /^ {2}"one two three four" \(4 words\): whole for 1\.0 s from 3\.0 s, needs 1\.5 s$/m);
  });

  it('the layout pass lists text outside the safe area at rest, text cut off, text over text for 0.2 s or more, and text under its contrast floor; text covered by a card and a brief crossing are not listed; exit 0; --no-layout skips it', () => {
    const r = check('layout.html', '--no-reading');
    assert.equal(r.code, 0, r.out);
    // The five the page is built to show. The two brief lines cross letter
    // over letter, so with a font whose letters meet over enough of them
    // each is also under its contrast floor; those are counted, not fixed.
    const brief = (r.out.match(/^ {2}contrast: "Brief (one|two)"/mg) || []).length;
    assert.match(r.out, new RegExp('^layout: ' + (5 + brief) + ' things to look at', 'm'));
    assert.match(r.out, /^ {2}outside the safe area: "In the margin" 10 px past the 16 px left margin from 0\.0 s for 3\.0 s$/m);
    assert.match(r.out, /^ {2}cut off: "Off the edge" \d+ px past the frame's right edge from 0\.0 s for 3\.0 s$/m);
    assert.match(r.out, /^ {2}text over text: "First title" and "Second title", \d+ by \d+ px from 0\.0 s for 1\.0 s$/m);
    assert.match(r.out, /^ {2}contrast: "Small gray" 3\.5:1 at [\d.]+ s \(16 px\), needs 4\.5:1$/m);
    const ramp = /^ {2}contrast: "White on a ramp" ([\d.]+):1/m.exec(r.out);
    assert.ok(ramp && Number(ramp[1]) < 2, 'white over the ramp is measured at its light end: ' + r.out);
    assert.doesNotMatch(r.out, /text over text: "Brief|"Big"|Fine text|Under the card/);
    const off = check('layout.html', '--no-reading', '--no-layout');
    assert.equal(off.code, 0, off.out);
    assert.doesNotMatch(off.out, /^layout:/m);
  });

  it('--pace measures every frame against the dial: a cut from dark to light is one snap in 2 s, the brightness range spans it, and the misses are marked; exit 0', () => {
    const r = check('pace.html', '--no-reading', '--pace', 'lively');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^pace \(lively, 2\.0 s\):$/m);
    assert.match(r.out, /^ {2}frames near still: 95%, target 35 to 60% {2}<< misses$/m);
    assert.match(r.out, /^ {2}snaps a minute: 30, target 20 to 60$/m);
    const range = Number((/brightness range: (\d+)/.exec(r.out) || [])[1]);
    assert.ok(range > 200, r.out);
    // Two flat grounds: no ramps of light, two tones.
    assert.match(r.out, /^ {2}smooth ramps \(light and shading\): 0% of a frame, target 15% or more {2}<< misses$/m);
    assert.match(r.out, /^ {2}tones in use: [12] a frame, target 14 or more {2}<< misses$/m);
  });

  it('--pace takes calm, lively or bold: exit 2 for anything else', () => {
    const r = check('pace.html', '--pace', 'loud');
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /--pace takes calm, lively or bold/);
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

  it('--strip tiles the frames --frames saves into strip.png, two by two for four; without --frames, exit 2', () => {
    const out = path.join(dir, 'strip');
    const r = check('good.html', '--samples', '2', '--frames', '4', '--strip', '--out', out);
    assert.equal(r.code, 0, r.out);
    const file = path.join(out, 'strip.png');
    assert.ok(PNG(file), r.out);
    const png = fs.readFileSync(file);
    // Two tiles across and down; a still of the root can be a pixel taller than 180.
    assert.equal(png.readUInt32BE(16), 640);
    assert.ok(Math.abs(png.readUInt32BE(20) - 360) <= 4, String(png.readUInt32BE(20)));
    assert.ok(r.out.includes('strip: ' + file), r.out);
    assert.equal(check('good.html', '--strip').code, 2);
  });

  it('--seam: a slide that jumps back at the loop is a jump, with where; a swing that closes is smooth; nothing fails the run', () => {
    const bad = check('seam-bad.html', '--no-reading', '--seam');
    assert.equal(bad.code, 0, bad.out);
    assert.match(bad.out, /^seam: the last frame to frame 0 changes [\d.]+, the frames either side [\d.]+ and [\d.]+ {2}<< a jump at the loop at x \d+, y \d+, \d+ by \d+$/m);
    const good = check('seam-good.html', '--no-reading', '--seam');
    assert.equal(good.code, 0, good.out);
    assert.match(good.out, /^seam: .*, smooth$/m);
  });

  it('--jumps finds a frame that pops in and out, both pairs, with where; a smooth slide has none; --isolate names the layer', () => {
    const r = check('pop.html', '--no-reading', '--jumps', '--isolate', '#pop,#slider,.none');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^jumps: 2 /m);
    // The box holds every pixel that changed in the pair: the pop's square and the slide's step.
    const m = /^ {2}frame 9 \(0\.900 s\) to 10: [\d.]+, usually [\d.]+ at x (\d+), y (\d+), (\d+) by (\d+)$/m.exec(r.out);
    assert.ok(m, r.out);
    const [x, y, w, h] = m.slice(1).map(Number);
    assert.ok(x <= 200 && y <= 20 && x + w >= 280 && y + h >= 100, r.out);
    assert.match(r.out, /^ {2}frame 10 \(1\.000 s\) to 11: /m);
    assert.match(r.out, /^isolate: frame (9|10) \(\d\.\d{3} s\) to frame (10|11), a change of [\d.]+, with each hidden in turn:$/m);
    const gone = (sel) => Number((new RegExp("^  '" + sel + "' \\(1\\): [\\d.]+, (-?\\d+)% of the change gone$", 'm').exec(r.out) || [])[1]);
    assert.ok(gone('#pop') > 80, r.out);
    assert.ok(gone('#slider') < 30, r.out);
    assert.match(r.out, /^ {2}'\.none': matches nothing$/m);
    const smooth = check('seam-bad.html', '--no-reading', '--jumps');
    assert.match(smooth.out, /^jumps: none/m);
  });

  it('--diff prints the change between two frames and where; --isolate with no pair says so; bad values exit 2', () => {
    const r = check('pop.html', '--no-reading', '--diff', '9,10');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^diff: frame 9 \(0\.900 s\) to frame 10: [\d.]+ at x \d+, y \d+, \d+ by \d+$/m);
    const none = check('seam-good.html', '--no-reading', '--isolate', '#slider');
    assert.match(none.out, /^isolate: no pair to isolate/m);
    for (const v of ['9', 'a,b', '1,2,3']) assert.equal(check('pop.html', '--diff', v).code, 2, v);
    assert.equal(check('pop.html', '--isolate', ',').code, 2);
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
