/**
 * With no runtime on the page, clips outside their window are hidden with
 * inline visibility on every seek, by the runtime's rule (half-open window,
 * the last clip shown on the final instant, a descendant of a hidden clip
 * hidden with it). With a runtime present, visibility is left alone.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, captureWarnings, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
  delete window.__hyperframes;
});

const vis = (host, id) => host.querySelector('#' + id).style.visibility;

describe(`clips without a runtime (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('hides a clip outside its window on every seek, keeps the last clip on the final instant, and hides what a hidden clip contains', async () => {
    const { wf } = await load();
    const host = await mount(`<div id="root" data-composition-id="cl1" data-no-timeline data-start="0" data-duration="6" data-width="640" data-height="360">
      <div id="a" data-start="0" data-duration="2"><i id="a1" data-start="1.5" data-duration="0.3"></i></div>
      <div id="b" data-start="a" data-duration="2"></div>
      <div id="c" data-start="4"></div>
      <p id="plain"></p>
    </div>`);
    cleanup.push(host);
    const at = async (t) => { wf.kinetic.seek(t); await tick(0); return ['root', 'a', 'a1', 'b', 'c'].map((id) => vis(host, id) === 'hidden' ? '-' : 'o').join(''); };
    expect(await at(1)).toBe('oo---');      // a shown, a1 before its window, b and c before theirs
    expect(await at(1.6)).toBe('ooo--');    // a1 inside its window
    expect(await at(2)).toBe('o--o-');      // half-open, so a ends at 2 as b starts
    expect(await at(3.9)).toBe('o--o-');
    expect(await at(4)).toBe('o---o');      // c has no duration, so it runs to the end
    expect(await at(6)).toBe('o---o');      // the final instant, and the root and c run to the end
    expect(vis(host, 'plain')).toBe('');    // an element with no data-start is not touched
  });

  it("a referenced clip's new length moves the clips timed from it: their window and their scene's local", async () => {
    const { wf } = await load();
    wf.kinetic.scene('cl-ref', {});
    const host = await mount(`<div data-composition-id="cl9" data-no-timeline data-start="0" data-duration="4">
      <div id="A" data-start="0" data-duration="1"></div>
      <div id="B" data-component="cl-ref" data-start="A" data-duration="1"><b data-bind="local"></b></div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    wf.kinetic.seek(1.5); await tick(0);
    expect(vis(host, 'B')).toBe('visible');
    host.querySelector('#A').setAttribute('data-duration', '2');
    wf.kinetic.seek(1.4); await tick(0);
    expect(vis(host, 'B')).toBe('hidden');
    // B now starts at 2: before it, its local holds at 0.
    expect(Number(host.querySelector('#B b').textContent)).toBe(0);
    wf.kinetic.seek(2.4); await tick(0);
    expect(vis(host, 'B')).toBe('visible');
    expect(Number(host.querySelector('#B b').textContent)).toBeCloseTo(0.4, 6);
  });

  it('hides what a hidden clip contains even inside its own window', async () => {
    const { wf } = await load();
    const host = await mount(`<div id="root" data-composition-id="cl2" data-no-timeline data-start="0" data-duration="6">
      <div id="outer" data-start="0" data-duration="1"><i id="inner" data-start="0.5" data-duration="2"></i></div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.seek(0.7); await tick(0);
    expect([vis(host, 'outer'), vis(host, 'inner')]).toEqual(['visible', 'visible']);
    wf.kinetic.seek(1.5); await tick(0);
    expect([vis(host, 'outer'), vis(host, 'inner')]).toEqual(['hidden', 'hidden']);   // inner's window holds 1.5, outer's does not
  });

  it('leaves visibility alone when a runtime is on the page', async () => {
    const { wf } = await load();
    const host = await mount(`<div id="root" data-composition-id="cl3" data-no-timeline data-start="0" data-duration="6">
      <div id="a" data-start="0" data-duration="2"></div>
      <div id="b" data-start="4" data-duration="2"></div>
    </div>`);
    cleanup.push(host);
    window.__hyperframes = {};   // what the runtime sets as it loads
    wf.kinetic.seek(1); await tick(0);
    expect([vis(host, 'a'), vis(host, 'b')]).toEqual(['', '']);
  });
});

describe(`clips off the frame grid (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('KN-114: a clip whose start or end falls between two frames warns once per element, in development only', async () => {
    const { wf } = await load();
    const host = await mount(`<div id="root" data-composition-id="cl4" data-no-timeline data-start="0" data-duration="6" data-fps="30">
      <div id="late" data-start="3.01" data-duration="1"></div>
      <div id="ok" data-start="0.5" data-duration="1.5"></div>
      <div id="tail" data-start="1" data-end="2.505"></div>
      <div id="after" data-start="ok + 0.01" data-duration="1"></div>
      <div id="sum" data-start="2" data-duration="0.01"></div>
      <div id="third" data-start="0.1" data-duration="0.2"></div>
    </div>`);
    cleanup.push(host);
    const lines = await captureWarnings(async () => {
      wf.kinetic.seek(1); await tick(0);
      wf.kinetic.seek(2); await tick(0);
    });
    const kn = lines.filter((l) => l.includes('KN-114'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.length, kn.join(' || ')).toBe(4);
    expect(kn[0]).toMatch(/the clip div#late has data-start="3\.01", which falls between frame 90 \(3 s\) and frame 91 \(3\.0333 s\), and ends at 4\.01 s \(data-start \+ data-duration\), which falls between frame 120 \(4 s\) and frame 121 \(4\.0333 s\), at 30 fps/);
    expect(lines[lines.indexOf(kn[0]) + 1]).toMatch(/Suggestion: .*3 \(frame 90\) and 3\.03333333 \(frame 91\)/);
    // A shutter's samples run inside the frame, so there the change can start in the frame before.
    expect(kn[0]).toMatch(/so the clip changes on the later frame, or in a render with a shutter part-way through the frame before$/);
    expect(kn[1]).toMatch(/div#tail has data-end="2\.505", which falls between frame 75 \(2\.5 s\) and frame 76 \(2\.5333 s\), at 30 fps/);
    expect(kn[2]).toMatch(/div#after has data-start="ok \+ 0\.01", which resolves to 2\.01 s and falls between frame 60 \(2 s\) and frame 61 \(2\.0333 s\)/);
    expect(kn[3]).toMatch(/div#sum ends at 2\.01 s \(data-start \+ data-duration\), which falls between frame 60 \(2 s\) and frame 61 \(2\.0333 s\), at 30 fps/);
  });

  it("KN-114: reads the composition's own data-fps, and checks with a runtime on the page too", async () => {
    const { wf } = await load();
    const host = await mount(`<div id="root" data-composition-id="cl5" data-no-timeline data-start="0" data-duration="6" data-fps="25">
      <div id="half" data-start="0.5" data-duration="1.1"></div>
      <div id="tenth" data-start="0.4" data-duration="1.2"></div>
    </div>`);
    cleanup.push(host);
    window.__hyperframes = {};
    const lines = await captureWarnings(async () => { wf.kinetic.seek(1); await tick(0); });
    const kn = lines.filter((l) => l.includes('KN-114'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.length, kn.join(' || ')).toBe(1);
    expect(kn[0]).toMatch(/div#half has data-start="0\.5", which falls between frame 12 \(0\.48 s\) and frame 13 \(0\.52 s\), at 25 fps/);
  });
});
