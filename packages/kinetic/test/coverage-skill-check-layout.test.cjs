/**
 * Tests for check.cjs: the layout and pace passes on pages
 * where what the window shows, what a mask clips and what an overlay covers
 * differ from what the elements' boxes say. Kept beside
 * coverage-skill-check.test.cjs, in its style; run with
 *
 *   node --test packages/kinetic/test/coverage-skill-check-layout.test.cjs
 *
 * Each page lives in a temporary folder with copies of the framework's lite
 * development build and Kinetic's development build.
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
const CORE = [path.join(ROOT, 'www', 'js', 'dist', 'wildflower.lite.dev.js'), path.join(ROOT, 'node_modules', 'wildflowerjs', 'dist', 'wildflower.lite.dev.js')]
  .find((f) => fs.existsSync(f)) || path.join(ROOT, 'www', 'js', 'dist', 'wildflower.lite.dev.js');
const KINETIC = path.join(ROOT, 'packages', 'kinetic', 'dist', 'kinetic.wf.js');

let dir;

const page = (body, script) => '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0">' + body
  + '<script src="wildflower.lite.dev.js"></script><script src="kinetic.wf.js"></script><script>' + (script || '') + '</script></body></html>';

const root = (w, h, inner, style) => '<div data-composition-id="main" data-start="0" data-duration="3" data-fps="10" data-width="' + w + '" data-height="' + h
  + '" style="position:relative;width:' + w + 'px;height:' + h + 'px;background:#fff;overflow:hidden;' + (style || '') + '">' + inner + '</div>';

const P = (css, text) => '<p style="position:absolute;margin:0;font:bold 30px sans-serif;color:#111;white-space:nowrap;' + css + '">' + text + '</p>';

// A 1920 by 1080 piece with no preview bar, so no fit: scene one's caption
// in the lower right, covered from 1 s by scene two's opaque card.
const COVERED = root(1920, 1080, '<div data-start="0" data-duration="3" style="position:absolute;inset:0">' + P('left:1300px;top:900px;font-size:60px', 'Scene one caption') + '</div>'
  + '<div data-start="1" data-duration="2" style="position:absolute;left:960px;top:540px;width:960px;height:540px;background:#e8e0d0">' + P('left:300px;top:340px;font-size:60px', 'Scene two') + '</div>');

// A white block that appears at 1 s in the lower right quarter of a dark 1920 by 1080 piece.
const corner = (w, h) => root(w, h, '<div data-start="1" data-duration="2" style="position:absolute;right:0;bottom:0;width:' + (w / 3) + 'px;height:' + (h / 3) + 'px;background:#fff"></div>', 'background:#111');

const PAGES = {
  // A title waiting below its mask's window until 1 s, then rising; a subtitle under the mask.
  'mask.html': page(root(640, 360, '<div data-component="rise" data-start="0" data-duration="3" style="position:absolute;inset:0">'
    + '<div style="position:absolute;left:40px;top:40px;width:600px;height:48px;overflow:hidden"><h1 data-bind-style="lift" style="margin:0;font:bold 40px/48px sans-serif;white-space:nowrap">The title rises</h1></div>'
    + P('top:96px;left:40px;font-size:28px', 'A subtitle under it') + '</div>'),
  "wildflower.kinetic.scene('rise', { keyframes: { lift: { transform: { at: [1, 1.6], to: ['translateY(100%)', 'translateY(0%)'] } } } });"),
  // The same with a clip-path in place of the overflow.
  'clip.html': page(root(640, 360, '<div style="position:absolute;left:40px;top:40px;width:600px;height:48px;clip-path:inset(0 0 100% 0)"><h1 style="margin:0;font:bold 40px/48px sans-serif">Hidden by its clip path</h1></div>'
    + P('top:60px;left:40px;font-size:28px', 'A line in plain sight'))),
  'covered.html': page(COVERED),
  // The same piece below a 400 px page header.
  'header.html': page('<header style="height:400px;background:#ccc">A site header</header>' + COVERED),
  'pace-corner.html': page(corner(1920, 1080)),
  'pace-4k.html': page(corner(3840, 2160)),
  // Text in the margin and two titles over each other, under the page's own vignette layer.
  'vignette.html': page(root(640, 360, P('left:4px;top:40px', 'In the margin') + P('left:100px;top:200px', 'First title') + P('left:130px;top:210px', 'Second title')
    + '<div style="position:absolute;inset:0;background:radial-gradient(closest-side, transparent 60%, rgba(0,0,0,0.25))"></div>')),
  // A wipe, as Year in Review's: the next scene's opaque layer grows from the
  // left under a clip-path from 0.5 s to 2.5 s, its own title over the old
  // one's place; only the part of each the frame shows is measured.
  'wipe.html': page(root(640, 360, '<div style="position:absolute;inset:0">' + P('left:40px;top:60px;font-size:40px', 'The old title stays') + '</div>'
    + '<div data-component="wipe" data-start="0" data-duration="3" data-bind-style="clip" style="position:absolute;inset:0;overflow:hidden;background:#222">'
    + P('left:40px;top:50px;font-size:40px;color:#fff', 'The new title arrives') + '</div>'),
  "wildflower.kinetic.scene('wipe', { keyframes: { clip: { clipPath: { at: [0.5, 2.5], to: ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)'] } } } });"),
  // An opaque card over a line still hides it, overlay or not.
  'card.html': page(root(640, 360, P('left:4px;top:40px', 'Under the card') + '<i style="position:absolute;left:0;top:30px;width:400px;height:60px;background:#fff"></i>'
    + '<div style="position:absolute;inset:0;background:radial-gradient(closest-side, transparent 60%, rgba(0,0,0,0.25))"></div>')),
};

function check(...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', timeout: 180000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

describe("the skill's check.cjs, layout and pace beyond the window, under masks and under overlays", () => {
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kinetic-check-layout-'));
    fs.copyFileSync(CORE, path.join(dir, 'wildflower.lite.dev.js'));
    fs.copyFileSync(KINETIC, path.join(dir, 'kinetic.wf.js'));
    for (const [name, html] of Object.entries(PAGES)) fs.writeFileSync(path.join(dir, name), html);
  });
  after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

  it('a title clipped below its mask is not on screen: no text over text with the line under the mask, exit 0', () => {
    const r = check('mask.html', '--samples', '3', '--no-reading');
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, /^ {2}text over text:/m, r.out);
  });

  it('a line hidden by its clip-path is not read: the reading pass does not list it as held, the layout pass does not list it', () => {
    const r = check('clip.html', '--samples', '3');
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, /Hidden by its clip path/, r.out);
  });

  it('a 1920 by 1080 piece with no bar: a caption covered by the next scene\'s card is not text over text', () => {
    const r = check('covered.html', '--samples', '3', '--no-reading');
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, /^ {2}text over text:/m, r.out);
    assert.match(r.out, /^ {2}outside the safe area: "Scene one caption" \d+ px past the 96 px right margin from 0\.0 s for 1\.0 s$/m);
  });

  it('the same piece below a page header: the same findings', () => {
    const r = check('header.html', '--samples', '3', '--no-reading');
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, /^ {2}text over text:/m, r.out);
    assert.match(r.out, /^ {2}outside the safe area: "Scene one caption" \d+ px past the 96 px right margin from 0\.0 s for 1\.0 s$/m);
  });

  it('--pace sees a change in the lower right of a 1920 by 1080 piece with no bar: one snap in 3 s', () => {
    const r = check('pace-corner.html', '--samples', '3', '--no-reading', '--no-layout', '--pace', 'lively');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^ {2}snaps a minute: 20, target 20 to 60$/m);
  });

  it('--pace on a 3840 by 2160 piece: the same snap', () => {
    const r = check('pace-4k.html', '--samples', '3', '--no-reading', '--no-layout', '--pace', 'lively');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^ {2}snaps a minute: 20, target 20 to 60$/m);
  });

  it("a page's own vignette layer over the text hides nothing: the margin and the overlap are listed", () => {
    const r = check('vignette.html', '--samples', '3', '--no-reading');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^ {2}outside the safe area: "In the margin" /m);
    assert.match(r.out, /^ {2}text over text: "First title" and "Second title"/m);
  });

  it('a clip-path wipe: the new title over the part of the old one it has covered is not text over text', () => {
    const r = check('wipe.html', '--samples', '3', '--no-reading');
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, /^ {2}text over text:/m, r.out);
  });

  it('under the same vignette, a line under an opaque card is still left out', () => {
    const r = check('card.html', '--samples', '3', '--no-reading');
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, /Under the card/, r.out);
  });
});
