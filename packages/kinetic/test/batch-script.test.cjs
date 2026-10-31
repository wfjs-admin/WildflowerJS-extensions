/**
 * scripts/batch.cjs, run as its header says: a page with composition
 * variables is rendered once per row of a JSON or CSV file, in the installed
 * Chrome with HTML-in-Canvas on, each row's values injected as
 * window.__hfVariables before the page's scripts run.
 *
 * A Node test, since the script launches its own browser through Playwright.
 *
 *   node --test packages/kinetic/test/batch-script.test.cjs
 *
 * The page lives in a temporary folder with copies of the framework's lite
 * development build and Kinetic's development build. Each render is one
 * second at 10 fps, 320 by 180.
 */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(ROOT, 'packages', 'kinetic', 'scripts', 'batch.cjs');
// The core from this repository's build, or, in the extensions repository,
// the published one its CI installs.
const CORE = [path.join(ROOT, 'www', 'js', 'dist', 'wildflower.lite.dev.js'), path.join(ROOT, 'node_modules', 'wildflowerjs', 'dist', 'wildflower.lite.dev.js')]
  .find((f) => require('fs').existsSync(f)) || path.join(ROOT, 'www', 'js', 'dist', 'wildflower.lite.dev.js');
const KINETIC = path.join(ROOT, 'packages', 'kinetic', 'dist', 'kinetic.wf.js');

let dir;

const PAGE = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
  + '#main { position: relative; width: 320px; height: 180px; background: #123; color: #fff; font: 40px sans-serif; overflow: hidden }'
  + '</style></head><body>'
  + '<div id="main" data-composition-id="main" data-start="0" data-duration="1" data-fps="10" data-width="320" data-height="180"'
  + ' data-composition-variables=\'[{"id":"title","type":"string","label":"Title","default":"DEFAULT"},{"id":"size","type":"number","label":"Size","default":40}]\'>'
  + '<div data-component="card" data-start="0"><h1 data-bind="text" data-bind-style="look">x</h1></div></div>'
  + '<script src="wildflower.lite.dev.js"></script><script src="kinetic.wf.js"></script><script>'
  + "wildflower.kinetic.scene('card', {"
  + "  inputs: { title: { type: String, default: 'DEFAULT' }, size: { type: Number, default: 40, validator: (v) => v > 0 } },"
  + "  computed: { text() { return this.inputs.title; }, look() { return { fontSize: this.inputs.size + 'px', opacity: String(Math.min(1, Math.max(0, this.local * 2))) }; } }"
  + '});'
  + '</script></body></html>';

function run(...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', timeout: 180000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

before(() => {
  for (const f of [CORE, KINETIC]) assert.ok(fs.existsSync(f), f + ' is missing; build first');
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kinetic-batch-'));
  fs.copyFileSync(CORE, path.join(dir, 'wildflower.lite.dev.js'));
  fs.copyFileSync(KINETIC, path.join(dir, 'kinetic.wf.js'));
  fs.writeFileSync(path.join(dir, 'index.html'), PAGE);
  fs.writeFileSync(path.join(dir, 'rows.json'), JSON.stringify([{ title: 'ALPHA', size: 60 }, { title: 'BETA', size: 24 }]));
  fs.writeFileSync(path.join(dir, 'people.csv'), 'name,title,size\n"Ada, Lovelace",ALPHA,60\nBob,"He said ""hi""",24\n');
  fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify([{ title: 'OK', size: 30 }, { title: 'NO', size: -1 }]));
});

after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

describe('batch.cjs', () => {
  it('renders one MP4 per JSON row, named after the composition and the row number, with the row in the frames', () => {
    const r = run('index.html', 'rows.json', '--out', 'out-json');
    assert.equal(r.code, 0, r.out);
    const a = fs.readFileSync(path.join(dir, 'out-json', 'main-1.mp4'));
    const b = fs.readFileSync(path.join(dir, 'out-json', 'main-2.mp4'));
    assert.ok(a.length > 1000 && b.length > 1000, 'both files have frames: ' + a.length + ', ' + b.length);
    assert.equal(a.subarray(4, 8).toString(), 'ftyp', 'an MP4 file');
    assert.notEqual(a.toString('base64'), b.toString('base64'), 'the two rows render different pictures');
    assert.match(r.out, /row 1 of 2 .*ALPHA.* -> .*main-1\.mp4: 10 frames at 10 fps, 320x180/);
    assert.match(r.out, /2 of 2 rendered into/);
  });

  it('reads a CSV with quoted fields and names the files from --name', () => {
    const r = run('index.html', 'people.csv', '--out', 'out-csv', '--name', 'name');
    assert.equal(r.code, 0, r.out);
    assert.ok(fs.existsSync(path.join(dir, 'out-csv', 'Ada-Lovelace.mp4')), 'the comma inside the quotes stays in the field, and the name is made safe: ' + r.out);
    assert.ok(fs.existsSync(path.join(dir, 'out-csv', 'Bob.mp4')), r.out);
    assert.match(r.out, /He said \\"hi\\"/, 'a doubled quote reads as one');
  });

  it('stops at a row whose input fails, after the rows before it, with the KN line and exit code 1', () => {
    const r = run('index.html', 'bad.json', '--out', 'out-bad');
    assert.equal(r.code, 1, r.out);
    assert.ok(fs.existsSync(path.join(dir, 'out-bad', 'main-1.mp4')), 'the first row rendered: ' + r.out);
    assert.ok(!fs.existsSync(path.join(dir, 'out-bad', 'main-2.mp4')), 'the failed row wrote no file');
    assert.match(r.out, /row 2 of 2 .*readiness failed/);
    assert.match(r.out, /KN-130/);
    assert.match(r.out, /1 of 2 rendered .*stopped at the failed row/);
  });

  it('exits 2 for a missing argument, a missing file, a rows file with no rows and an unknown option', () => {
    assert.equal(run('index.html').code, 2);
    assert.equal(run('index.html', 'missing.json').code, 2);
    fs.writeFileSync(path.join(dir, 'empty.json'), '[]');
    assert.equal(run('index.html', 'empty.json').code, 2);
    assert.equal(run('index.html', 'rows.json', '--parallel', '4').code, 2);
  });
});
