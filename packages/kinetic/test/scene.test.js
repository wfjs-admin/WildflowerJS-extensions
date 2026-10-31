/**
 * scene(): the computeds a scene gets, timing from HyperFrames' attributes
 * (absolute and relative starts, host offsets, playback-start), edges,
 * per-instance variables, the seek hook and its barrier promise, and the
 * diagnostics for a definition that fights the model.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, dispatchSeek, captureWarnings, uniqueName, expectKN, FOOTAGE, BUILD, CORE, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
  delete window.__hfVariables;
  delete window.__hfVariablesByComp;
});

const READOUT = '<b class="time" data-bind="time"></b><b class="local" data-bind="local"></b><b class="clipFrame" data-bind="clipFrame"></b>'
  + '<b class="progress" data-bind="progress"></b><b class="remaining" data-bind="remaining"></b>'
  + '<b class="enter" data-bind="enter"></b><b class="exit" data-bind="exit"></b>';

const read = (host) => {
  const o = {};
  for (const k of ['time', 'local', 'clipFrame', 'progress', 'remaining', 'enter', 'exit']) o[k] = host.querySelector('.' + k).textContent;
  return o;
};

async function at(wf, t) { wf.kinetic.seek(t); await tick(0); }

describe(`scene (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a scene on a clip reads time, local, clipFrame, progress, remaining', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="r1" data-start="0" data-duration="10"><div data-component="${name}" data-start="1" data-duration="2">${READOUT}</div></div>`);
    cleanup.push(host);
    await at(wf, 1.5);
    // progress runs to 1 on the clip's last captured frame, 2 - 1/30 s in.
    expect(read(host)).toEqual({ time: '1.5', local: '0.5', clipFrame: '15', progress: String(0.5 / (2 - 1 / 30)), remaining: '1.5', enter: '1', exit: '0' });
    // Outside the clip, local holds at its edges: 0 before, the duration after.
    await at(wf, 0.5);
    expect(read(host)).toMatchObject({ local: '0', clipFrame: '0', progress: '0', remaining: '2' });
    await at(wf, 4);
    expect(read(host)).toMatchObject({ local: '2', clipFrame: '60', progress: '1', remaining: '0' });
  });

  it('local holds at the clip\'s edges: 0 before it, the duration after it; with no duration anywhere, only the start is held', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="r1b" data-start="0" data-duration="10"><div data-component="${name}" data-start="1" data-duration="2"><b class="l" data-bind="local"></b></div></div>`);
    cleanup.push(host);
    const read = () => host.querySelector('.l').textContent;
    await at(wf, 0.25); expect(read()).toBe('0');
    await at(wf, 1.5); expect(read()).toBe('0.5');
    await at(wf, 3); expect(read()).toBe('2');
    await at(wf, 7); expect(read()).toBe('2');
    const open = uniqueName('scene');
    wf.kinetic.scene(open, {});
    const host2 = await mount(`<div data-composition-id="r1c" data-start="0"><div data-component="${open}" data-start="1"><b class="c" data-bind="local"></b></div></div>`);
    cleanup.push(host2);
    wf.kinetic.config({});
    await at(wf, 0.5); expect(host2.querySelector('.c').textContent).toBe('0');
    await at(wf, 9); expect(host2.querySelector('.c').textContent).toBe('8');
  });

  it("root: styles the scene's own root from its own computed, the sanctioned route", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { root: { style: { opacity: 'fade' } }, computed: { fade() { return String(Math.min(1, this.local)); } } });
    const host = await mount(`<div data-composition-id="r1d" data-start="0" data-duration="4"><div data-component="${name}" data-start="1"></div></div>`);
    cleanup.push(host);
    const el = host.querySelector('[data-component]');
    await at(wf, 1.25); expect(el.style.opacity).toBe('0.25');
    await at(wf, 3); expect(el.style.opacity).toBe('1');
  });

  it('a scene with no clip of its own follows the composition root, and remaining runs to the root end', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="r2" data-start="0" data-duration="4"><div><div data-component="${name}">${READOUT}</div></div></div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    await at(wf, 3);
    expect(read(host)).toMatchObject({ time: '3', local: '3', progress: String(3 / (4 - 1 / 30)), remaining: '1' });
  });

  it('edges give enter and exit ramps', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { edges: { enter: 0.5, exit: 1 } });
    const host = await mount(`<div data-composition-id="r3" data-start="0" data-duration="10"><div data-component="${name}" data-start="2" data-duration="4">${READOUT}</div></div>`);
    cleanup.push(host);
    await at(wf, 2.25);
    expect(read(host)).toMatchObject({ enter: '0.5', exit: '0' });
    await at(wf, 3);
    expect(read(host)).toMatchObject({ enter: '1', exit: '0' });
    // The exit ramp ends on the last captured frame, 4 - 1/30 s into the clip.
    await at(wf, 5.5);
    expect(read(host)).toMatchObject({ enter: '1', exit: String((3.5 - (4 - 1 / 30 - 1)) / 1) });
    await at(wf, 7);
    expect(read(host)).toMatchObject({ exit: '1' });
    expect(() => wf.kinetic.scene(uniqueName('bad'), { edges: { enter: -1 } })).toThrow(/KN-100/);
    expect(() => wf.kinetic.scene(uniqueName('bad'), { edges: 3 })).toThrow(/KN-100/);
  });

  it('presence is enter * (1 - exit); clipFrame is Math.round(local * fps)', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { edges: { enter: 0.5, exit: 1 } });
    const host = await mount(`<div data-composition-id="r3p" data-start="0" data-duration="10"><div data-component="${name}" data-start="2" data-duration="4"><b class="p" data-bind="presence"></b><b class="cf" data-bind="clipFrame"></b></div></div>`);
    cleanup.push(host);
    const now = () => ['p', 'cf'].map((k) => host.querySelector('.' + k).textContent);
    await at(wf, 1); expect(now()).toEqual(['0', '0']);
    await at(wf, 2.25); expect(now()).toEqual(['0.5', '8']);
    await at(wf, 3); expect(now()).toEqual(['1', '30']);
    await at(wf, 5.5); expect(now()).toEqual([String(1 - (3.5 - (4 - 1 / 30 - 1)) / 1), '105']);
    await at(wf, 7); expect(now()).toEqual(['0', '120']);
    // Without edges a scene is present for the whole clip.
    const plain = uniqueName('scene');
    wf.kinetic.scene(plain, {});
    const host2 = await mount(`<div data-composition-id="r3q" data-start="0" data-duration="10"><div data-component="${plain}" data-start="1" data-duration="2"><b class="p" data-bind="presence"></b></div></div>`);
    cleanup.push(host2);
    await at(wf, 1.5); expect(host2.querySelector('.p').textContent).toBe('1');
  });

  if (BUILD === 'dev') {
    it('presence and clipFrame are reserved: a scene that defines either is warned about (KN-152, dev)', async () => {
      const { wf } = await load();
      const lines = await captureWarnings(async () => {
        wf.kinetic.scene(uniqueName('scene'), { computed: { presence() { return 1; } }, state: { clipFrame: 0 } });
      });
      const kn = lines.filter((l) => l.includes('KN-152'));
      expect(kn.length).toBe(1);
      expect(kn[0]).toMatch(/'clipFrame'/);
      expect(kn[0]).toMatch(/'presence'/);
    });
  }

  it('exit and progress reach 1 on the last captured frame of a clip, and are below 1 one frame earlier', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { edges: { enter: 0.5, exit: 0.5 } });
    const host = await mount(`<div data-composition-id="r3l" data-start="0" data-duration="4" data-fps="30"><div data-component="${name}" data-start="1" data-duration="2">${READOUT}<b class="presence" data-bind="presence"></b></div></div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    // A render of a 2 s clip at 30 fps captures its frames 0 to 59.
    await at(wf, 1 + 59 / 30);
    expect(read(host)).toMatchObject({ exit: '1', progress: '1' });
    expect(host.querySelector('.presence').textContent).toBe('0');
    await at(wf, 1 + 58 / 30);
    const before = read(host);
    expect(Number(before.exit)).toBeLessThan(1);
    expect(Number(before.exit)).toBeGreaterThan(0.9);
    expect(Number(before.progress)).toBeLessThan(1);
    // A clip one frame long or less: progress 1 on its frame, nothing divided by 0.
    const short = uniqueName('scene');
    wf.kinetic.scene(short, { edges: { exit: 0.5 } });
    const host2 = await mount(`<div data-composition-id="r3s" data-start="0" data-duration="4" data-fps="30"><div data-component="${short}" data-start="2" data-duration="0.02">${READOUT}</div></div>`);
    cleanup.push(host2);
    await at(wf, 2);
    expect(read(host2)).toMatchObject({ progress: '1', exit: '1' });
    // Before it, hidden, local holds at 0, its start, so the same.
    await at(wf, 1);
    expect(read(host2)).toMatchObject({ local: '0', progress: '1', exit: '1' });
  });

  it('frame is not a field the scene provides: a computed of that name is the scene\'s own, with no warning, and clipFrame is the clip\'s frame', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const lines = await captureWarnings(async () => {
      wf.kinetic.scene(name, { computed: { frame() { return 'own'; }, clip() { return String(this.clipFrame); } } });
    });
    const host = await mount(`<div data-composition-id="r3f" data-start="0" data-duration="4" data-fps="30"><div data-component="${name}" data-start="0"><i data-bind="frame"></i><b data-bind="clip"></b></div></div>`);
    cleanup.push(host);
    await at(wf, 0.5);
    expect(host.querySelector('i').textContent).toBe('own');
    expect(host.querySelector('b').textContent).toBe('15');
    expect(lines.filter((l) => /\[KN-/.test(l))).toEqual([]);
  });

  it('a pool inside a scene is flushed by every seek: what seek(local) wrote with update() is in the DOM when the seek settles, with no animation frame', async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.pools === false) skip();   // nano, mini: no pools
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {
      pools: { dots: {} },
      init() { for (let i = 0; i < 3; i++) this.pools.dots.add({ id: i, style: {} }); },
      seek(local) { this.pools.dots.forEach((d) => this.pools.dots.update(d.id, { style: { width: Math.round(local * 10 + d.id) + 'px' } })); },
    });
    let widths, host;
    const lines = await captureWarnings(async () => {
      host = await mount(`<div data-composition-id="r-pool" data-start="0" data-duration="5"><div data-component="${name}" data-start="0"><div class="dots" data-pool="dots" data-key="id"><template><i data-bind-style="style"></i></template></div></div></div>`);
      cleanup.push(host);
      // init() runs a task after the scan, and adds the entities.
      for (let i = 0; i < 100 && host.querySelectorAll('.dots i').length < 3; i++) await tick(2);
      // The seek settles in microtasks, so no animation frame comes between
      // the seek and the read: the flush is the seek's own.
      await dispatchSeek(1.5).done;
      widths = [...host.querySelectorAll('.dots i')].map((i) => i.style.width);
      await dispatchSeek(2).done;
    });
    expect(widths).toEqual(['15px', '16px', '17px']);
    expect([...host.querySelectorAll('.dots i')].map((i) => i.style.width)).toEqual(['20px', '21px', '22px']);
    expect(host.querySelector('.dots').hasAttribute('data-pool-static')).toBe(false);   // the pool is left as written
    expect(lines.filter((l) => /\[KN-/.test(l))).toEqual([]);
    // A scene scanned into a composition that is already on the page, with the wf- prefix.
    const late = uniqueName('scene');
    wf.kinetic.scene(late, {
      pools: { marks: {} },
      init() { this.pools.marks.add({ id: 1, style: {} }); },
      seek(local) { this.pools.marks.update(1, { style: { height: Math.round(local * 10) + 'px' } }); },
    });
    const lines2 = await captureWarnings(async () => {
      const el = document.createElement('div');
      el.innerHTML = `<div data-component="${late}" data-start="0"><div class="marks" data-wf-pool="marks" data-key="id"><template><b data-bind-style="style"></b></template></div></div>`;
      host.firstElementChild.appendChild(el);
      wf.scan(el);
      if (typeof wf.whenIdle === 'function') await wf.whenIdle();
      for (let i = 0; i < 100 && el.querySelectorAll('.marks b').length < 1; i++) await tick(2);
      await dispatchSeek(3).done;
      widths = [...el.querySelectorAll('.marks b')].map((b) => b.style.height);
    });
    expect(widths).toEqual(['30px']);
    expect(host.querySelector('.marks').hasAttribute('data-wf-pool-static')).toBe(false);
    expect(lines2.filter((l) => /\[KN-/.test(l))).toEqual([]);
  });

  it('a pool inside an <svg> draws shapes from data: each seek leaves every path with the d of its time, and check() passes', async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.pools === false) skip();   // nano, mini: no pools
    const name = uniqueName('scene');
    // Each flow is a line whose end moves with the time: d at local t.
    const d = (id, t) => 'M0 ' + (id * 10) + ' L' + (Math.round(t * 30) * 2 + id) + ' ' + (id * 10);
    wf.kinetic.scene(name, {
      pools: { flows: {} },
      init() { for (let i = 0; i < 4; i++) this.pools.flows.add({ id: i, attrs: { d: d(i, 0) } }); },
      seek(local) { this.pools.flows.forEach((f) => this.pools.flows.update(f.id, { attrs: { d: d(f.id, local) } })); },
    });
    let host, report;
    const paths = () => [...host.querySelectorAll('svg g.flows path')].map((p) => p.getAttribute('d'));
    const lines = await captureWarnings(async () => {
      host = await mount(`<div data-composition-id="${uniqueName('svgpool')}" data-start="0" data-duration="2" data-fps="30" data-width="320" data-height="180">`
        + `<div data-component="${name}" data-start="0" data-duration="2"><svg viewBox="0 0 320 180" width="320" height="180">`
        + '<g class="flows" data-pool="flows" data-key="id"><template><path stroke="#fff" fill="none" data-bind-attr="attrs"></path></template></g>'
        + '</svg></div></div>');
      cleanup.push(host);
      for (let i = 0; i < 100 && host.querySelectorAll('svg g.flows path').length < 4; i++) await tick(2);
      for (const t of [0.5, 1.5, 0.2]) {
        await dispatchSeek(t).done;
        expect(paths(), 'at ' + t + ' s').toEqual([0, 1, 2, 3].map((i) => d(i, t)));
      }
      // The paths are SVG elements, drawn: each has a length.
      expect([...host.querySelectorAll('svg g.flows path')].every((p) => p.namespaceURI === 'http://www.w3.org/2000/svg' && p.getTotalLength() > 0)).toBe(true);
      report = await wf.kinetic.check({ samples: 20 });
    });
    expect(report.ok, JSON.stringify(report)).toBe(true);
    expect(lines.filter((l) => /\[KN-|WF-/.test(l))).toEqual([]);
  });

  it("without the runtime, inputs read the defaults the root declares in data-composition-variables, under window.__hfVariables; the root's default wins over the scene's", async () => {
    const { wf } = await load();
    const decl = JSON.stringify([{ id: 'title', type: 'string', default: 'From HTML' }, { id: 'count', type: 'number', default: 3 }]);
    const name = uniqueName('scene');
    let lines = await captureWarnings(async () => {
      wf.kinetic.scene(name, { inputs: { title: { type: String, default: 'From JS' }, count: { type: Number, default: 3 }, only: { type: String, default: 'JS only' } } });
    });
    const markup = (id) => `<div data-composition-id="${id}" data-start="0" data-duration="2" data-composition-variables='${decl}'><div data-component="${name}" data-start="0">`
      + '<b class="t" data-bind="inputs.title"></b><b class="c" data-bind="inputs.count"></b><b class="o" data-bind="inputs.only"></b><b class="v" data-bind="vars.title"></b></div></div>';
    let host;
    lines = lines.concat(await captureWarnings(async () => { host = await mount(markup('r-vars')); }));
    cleanup.push(host);
    const texts = (h) => ['t', 'c', 'o', 'v'].map((k) => h.querySelector('.' + k).textContent);
    expect(texts(host)).toEqual(['From HTML', '3', 'JS only', 'From HTML']);
    window.__hfVariables = { title: 'Injected' };
    const host2 = await mount(markup('r-vars2'));
    cleanup.push(host2);
    expect(texts(host2)).toEqual(['Injected', '3', 'JS only', 'Injected']);
    const kn = lines.filter((l) => l.includes('KN-134'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.length, kn.join(' || ')).toBe(1);
    expect(kn[0]).toMatch(new RegExp("scene '" + name + "' input 'title' has the default \"From JS\".*declares \"From HTML\""));
  });

  it('data-start references resolve to the end of the named clip, plus the offset', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="r4" data-start="0" data-duration="10">
      <div id="intro-${name}" data-start="1" data-duration="2"></div>
      <div data-component="${name}" data-start="intro-${name} + 0.5" data-duration="1">${READOUT}</div>
    </div>`);
    cleanup.push(host);
    await at(wf, 4);
    expect(read(host)).toMatchObject({ local: '0.5', progress: String(0.5 / (1 - 1 / 30)) });
  });

  it('"voice.start" is when that clip starts, plus or minus an offset; "voice.end" is plain "voice"; an id that is the whole token wins; a scene and an audio clip both resolve it', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const clip = (cls, start) => `<div class="${cls}" data-component="${name}" data-start="${start}"><b data-bind="local"></b></div>`;
    // The audio clip starts from a scene's start: 3 + 1 = 4, and lasts 6.
    const host = await mount(`<div data-composition-id="r4s" data-start="0" data-duration="20">
      <div id="intro-${name}" data-start="3" data-duration="2"></div>
      <audio id="voice-${name}" src="${FOOTAGE}f30.webm" data-start="intro-${name}.start + 1" data-duration="6"></audio>
      <div id="cue-${name}" data-start="7" data-duration="1"></div>
      <div id="cue-${name}.start" data-start="1" data-duration="2"></div>
      ${clip('a', `voice-${name}.start`)}${clip('b', `voice-${name}.start + 0.5`)}${clip('c', `voice-${name}.start-0.5`)}
      ${clip('d', `voice-${name}.end`)}${clip('e', `voice-${name}`)}${clip('f', `cue-${name}.start`)}${clip('g', `cue-${name}.end - 1`)}
    </div>`);
    cleanup.push(host);
    await at(wf, 5);
    const local = (cls) => host.querySelector('.' + cls + ' b').textContent;
    // d, e and g have not started (local holds at 0); at 11 s they have.
    expect(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(local)).toEqual(['1', '0.5', '1.5', '0', '0', '2', '0']);
    await at(wf, 11);
    expect(['d', 'e', 'g'].map(local)).toEqual(['1', '1', '4']);
    expect([wf.kinetic.timeOf(`voice-${name}.start`), wf.kinetic.timeOf(`voice-${name}.start - 1`), wf.kinetic.timeOf(`voice-${name}.end`), wf.kinetic.timeOf(`cue-${name}.start`)]).toEqual([4, 3, 10, 3]);
  });

  if (BUILD === 'dev') {
    it('KN-113: a ".start" reference whose clip is no element starts at 0 (dev)', async () => {
      const { wf } = await load();
      const name = uniqueName('scene');
      wf.kinetic.scene(name, {});
      let host;
      const lines = await captureWarnings(async () => {
        host = await mount(`<div data-composition-id="r4g" data-start="0" data-duration="5"><div data-component="${name}" data-start="ghost-${name}.start + 1"><b data-bind="local"></b></div></div>`);
      });
      cleanup.push(host);
      const kn = lines.filter((l) => l.includes('KN-113'));
      expect(kn.length, lines.join(' || ')).toBe(1);
      expect(kn[0]).toContain(`names 'ghost-${name}.start'`);
      await at(wf, 2);
      expect(host.querySelector('b').textContent).toBe('2');
    });
  }

  it('a nested composition adds its host offset, and data-playback-start shifts local', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="r5" data-start="0" data-duration="20">
      <div data-composition-id="sub-${name}" data-start="2" data-duration="5" data-playback-start="4">
        <div data-component="${name}" data-start="1" data-duration="3">${READOUT}</div>
      </div>
    </div>`);
    cleanup.push(host);
    // The scene's clip starts at 2 + 1 = 3 on the composition clock.
    await at(wf, 3.5);
    expect(read(host)).toMatchObject({ local: '0.5' });
    // A scene on the nested root itself sees the root's playback start.
    const name2 = uniqueName('scene');
    wf.kinetic.scene(name2, {});
    const host2 = await mount(`<div data-composition-id="r5b" data-start="0" data-duration="20">
      <div data-composition-id="sub-${name2}" data-start="2" data-duration="5" data-playback-start="4" data-component="${name2}">${READOUT}</div>
    </div>`);
    cleanup.push(host2);
    await at(wf, 3);
    expect(read(host2)).toMatchObject({ local: '5', progress: '1' });
  });

  it('an inlined composition root with no data-start runs when its host does', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="r6" data-start="0" data-duration="20">
      <div data-start="3" data-duration="4" data-composition-file="x.html">
        <div data-composition-id="inner-${name}">
          <div data-component="${name}">${READOUT}</div>
        </div>
      </div>
    </div>`);
    cleanup.push(host);
    await at(wf, 4);
    expect(read(host)).toMatchObject({ local: '1' });
  });

  it('vars are the variables HyperFrames resolved for the scene\'s own composition', async () => {
    const { wf } = await load();
    window.__hfVariables = { title: 'top' };
    window.__hfVariablesByComp = { ['va-' + 1]: { title: 'A' } };
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="r7" data-start="0" data-duration="5">
      <div data-composition-id="va-1" data-start="0"><div data-component="${name}"><b class="v" data-bind="vars.title"></b></div></div>
      <div data-composition-id="vb-1" data-start="0"><div data-component="${name}"><b class="v" data-bind="vars.title"></b></div></div>
    </div>`);
    cleanup.push(host);
    const v = [...host.querySelectorAll('.v')].map((b) => b.textContent);
    expect(v).toEqual(['A', 'top']);
  });

  it('a composition id that is an Object.prototype name reads the top-level variables, not the inherited member', async () => {
    const { wf } = await load();
    window.__hfVariables = { title: 'top' };
    window.__hfVariablesByComp = {};
    const name = uniqueName('scene');
    let seen;
    wf.kinetic.scene(name, { init() { seen = this.vars; } });
    const host = await mount(`<div data-composition-id="r-proto" data-start="0" data-duration="5">
      <div data-composition-id="constructor" data-start="0"><div data-component="${name}"><b class="v" data-bind="vars.title"></b></div></div>
    </div>`);
    cleanup.push(host);
    expect(typeof seen).toBe('object');
    expect(host.querySelector('.v').textContent).toBe('top');
  });

  it('an input that is an Object.prototype name reads its default, or undefined, when the composition has no such variable', async () => {
    const { wf } = await load();
    window.__hfVariables = {};
    const name = uniqueName('scene');
    let seen = null;
    wf.kinetic.scene(name, {
      inputs: { toString: String, valueOf: { type: String, default: 'own' } },
      init() { seen = { toString: this.inputs.toString, valueOf: this.inputs.valueOf }; },
    });
    const host = await mount(`<div data-composition-id="r-proto-in" data-start="0" data-duration="2"><div data-component="${name}"></div></div>`);
    cleanup.push(host);
    expect(seen).toEqual({ toString: undefined, valueOf: 'own' });
  });

  it("the author's subscribe block keeps its shape and gains the clock", async () => {
    const { wf } = await load();
    const other = uniqueName('other');
    wf.store(other, { state: { label: 'x' } });
    const a = uniqueName('scene');
    const b = uniqueName('scene');
    wf.kinetic.scene(a, { subscribe: [other], computed: { both() { return this.stores[other].label + '@' + this.local; } } });
    wf.kinetic.scene(b, { subscribe: { [other]: ['label'] }, computed: { both() { return this.stores[other].label + '@' + this.local; } } });
    const host = await mount(`<div data-composition-id="r8" data-start="0" data-duration="5">
      <div data-component="${a}" data-start="1"><b class="a" data-bind="both"></b></div>
      <div data-component="${b}" data-start="2"><b class="b" data-bind="both"></b></div>
    </div>`);
    cleanup.push(host);
    await at(wf, 3);
    expect(host.querySelector('.a').textContent).toBe('x@2');
    expect(host.querySelector('.b').textContent).toBe('x@1');
  });

  it('rows derived from local in a computed follow every seek, in any order', async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.lists === false) skip();   // nano, mini-pool: no data-list
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {
      computed: {
        bars() {
          return [0, 1, 2].map((i) => ({ key: i, style: { opacity: String(Math.max(0, Math.min(1, this.local - i * 0.5))) } }));
        },
      },
    });
    const host = await mount(`<div data-composition-id="r9" data-start="0" data-duration="5">
      <div data-component="${name}" data-start="1"><ol data-list="bars" data-key="key"><template><li data-bind-style="style"></li></template></ol></div>
    </div>`);
    cleanup.push(host);
    const snap = async (t) => { await at(wf, t); return [...host.querySelectorAll('li')].map((li) => li.style.opacity).join(' '); };
    const first = {}; for (const t of [1.25, 2.5, 1.75]) first[t] = await snap(t);
    const second = {}; for (const t of [1.75, 1.25, 2.5]) second[t] = await snap(t);
    expect(second).toEqual(first);
    expect(first[2.5]).toBe('1 1 0.5');
  });

  it('seek(local) runs once at init and after every seek; a returned promise holds the barrier', async () => {
    const { wf } = await load();
    const seen = [];
    let release;
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {
      seek(local) {
        seen.push(local);
        if (local === 2.5) return new Promise((r) => { release = r; });
      },
    });
    wf.kinetic.seek(1);
    const host = await mount(`<div data-composition-id="r10" data-start="0" data-duration="5"><div data-component="${name}" data-start="1"></div></div>`);
    cleanup.push(host);
    expect(seen).toEqual([0]);
    wf.kinetic.seek(1.5);
    expect(seen).toEqual([0, 0.5]);
    const { done } = dispatchSeek(3.5);
    expect(seen).toEqual([0, 0.5, 2.5]);
    let settled = false;
    done.then(() => { settled = true; });
    await tick(10);
    expect(settled).toBe(false);
    release();
    await tick(0);
    expect(settled).toBe(true);
    // A destroyed scene is not seeked. (unregister, not host.remove(): the
    // tiers without the removal observer leave teardown to the author.)
    wf.unregister(name);
    await tick(0);
    wf.kinetic.seek(4);
    expect(seen.length).toBe(3);
  });

  it('a hidden scene costs nothing per seek: its computeds of local do not run on seeks outside its clip, its seek(local) runs once at each edge, and it shows the right frame when its clip comes round', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const runs = { a: 0, b: 0 }, seeks = { a: [], b: [] };
    wf.kinetic.scene(name, {
      computed: { label() { runs[this.element.id]++; return 'at ' + this.local.toFixed(2); } },
      seek(local) { seeks[this.element.id].push(local); this.element.querySelector('i').textContent = local.toFixed(2); },
    });
    const host = await mount(`<div data-composition-id="hs1" data-start="0" data-duration="8">
      <div id="a" data-component="${name}" data-start="0" data-duration="4"><b data-bind="label"></b><i></i></div>
      <div id="b" data-component="${name}" data-start="4" data-duration="4"><b data-bind="label"></b><i></i></div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    await at(wf, 0.5);
    const r0 = runs.b, s0 = seeks.b.length;
    // Sixty seeks inside a: b, before its clip, runs nothing.
    for (let f = 1; f <= 60; f++) await at(wf, 0.5 + f / 30);
    expect([runs.b - r0, seeks.b.length - s0]).toEqual([0, 0]);
    expect(runs.a).toBeGreaterThan(60);
    // b's first frame: local 0 again, inside its clip now, so seek(local) runs.
    await at(wf, 4);
    expect(seeks.b.slice(-1)).toEqual([0]);
    expect(host.querySelector('#b b').textContent).toBe('at 0.00');
    await at(wf, 5.25);
    expect(seeks.b.slice(-1)).toEqual([1.25]);
    expect([host.querySelector('#b b').textContent, host.querySelector('#b i').textContent]).toEqual(['at 1.25', '1.25']);
    // a, past its clip: its edge frame once, then nothing.
    const sa = seeks.a.length, ra = runs.a;
    for (const t of [6, 6.5, 7]) await at(wf, t);
    expect(seeks.a.slice(sa)).toEqual([]);
    expect(runs.a).toBe(ra);
    expect(seeks.a.slice(-1)).toEqual([4]);
    // Back into a: the right frame.
    await at(wf, 2.5);
    expect([host.querySelector('#a b').textContent, host.querySelector('#a i').textContent]).toEqual(['at 2.50', '2.50']);
  });

  it('check() passes on a page of several scenes on consecutive clips, each drawing a canvas from local, and calls every seek(local) on every seek', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    let calls = 0;
    wf.kinetic.scene(name, {
      computed: { shade() { return 'rgb(' + Math.round(this.local * 60) + ', 0, 0)'; } },
      seek(local) {
        calls++;
        const ctx = this.element.querySelector('canvas').getContext('2d');
        ctx.fillStyle = 'rgb(0, ' + Math.round(local * 60) + ', 0)';
        ctx.fillRect(0, 0, 4, 4);
      },
    });
    const clips = [0, 1, 2, 3].map((i) => `<div data-component="${name}" data-start="${i}" data-duration="1"><canvas width="4" height="4"></canvas><b data-bind-style="{ color: shade }"></b></div>`).join('');
    const host = await mount(`<div data-composition-id="hs2" data-start="0" data-duration="4" data-fps="10">${clips}</div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    calls = 0;
    const r = await wf.kinetic.check({ samples: 12 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    // Two passes of 12, the seek back, four scenes each.
    expect(calls).toBeGreaterThanOrEqual(4 * 24);
  });

  it('a scene\'s state changed at rest in interactive mode seeks it again though its local has not moved', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const seen = [];
    wf.kinetic.scene(name, { state: { n: 0 }, bump() { this.n++; }, seek(local) { seen.push([this.n, local]); } });
    const host = await mount(`<div data-composition-id="hs3" data-start="0" data-duration="4"><div data-component="${name}" data-start="2" data-duration="1"><button data-action="bump"></button></div></div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    const frames = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r)); await tick(0); };
    await at(wf, 0.5);
    await at(wf, 1);
    seen.length = 0;
    host.querySelector('button').click();
    await frames();
    expect(seen).toEqual([[1, 0]]);
  });

  it('KN-159: a key read on a keyframes style object that it lacks warns once per entry and key (dev); data-bind-style and the framework read it without a word; production hands out the plain object', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    let seen = null;
    wf.kinetic.scene(name, {
      keyframes: {
        rise: { opacity: { at: [0, 1], to: [0, 1] }, translateY: { at: [0, 1], to: [40, 0] } },
        sweep: { at: [0, 1], to: [0, 10] },
      },
      computed: {
        lift() { seen = this.rise; return this.rise.translateY; },
        tint() { return this.rise.color; },
        has() { const r = this.rise; return [r.opacity, 'translateY' in r, r.then, r.toJSON, r[Symbol.iterator], r.__wf, r.length].map(String).join(','); },
        json() { return JSON.stringify(this.rise); },
        sum() { return this.sweep + 1; },
      },
    });
    let host;
    const lines = await captureWarnings(async () => {
      host = await mount(`<div data-composition-id="${uniqueName('r')}" data-start="0" data-duration="4">
        <div data-component="${name}" data-start="0" data-duration="4"><h1 data-bind-style="rise"></h1><b class="lift" data-bind="lift"></b><b class="tint" data-bind="tint"></b><b class="has" data-bind="has"></b><b class="json" data-bind="json"></b><b class="sum" data-bind="sum"></b></div>
      </div>`);
      cleanup.push(host);
      for (const t of [0.5, 0.25, 2]) await at(wf, t);
    });
    const h = host.querySelector('h1');
    expect([h.style.opacity, h.style.transform]).toEqual(['1', 'translate(0px, 0px)']);
    expect(host.querySelector('.json').textContent).toBe('{"transform":"translate(0px, 0px)","opacity":1}');
    expect(host.querySelector('.has').textContent).toBe('1,false,undefined,undefined,undefined,undefined,undefined');
    expect(host.querySelector('.sum').textContent).toBe('11');
    const kn = lines.filter((l) => l.startsWith('[KN-159]'));
    if (BUILD === 'min') {
      expect(kn).toEqual([]);
      // No proxy around it: a proxy cannot be cloned.
      expect(() => structuredClone(seen)).not.toThrow();
    } else {
      expect(kn).toEqual([
        "[KN-159] scene '" + name + "': 'rise' is a style object (transform, opacity); translateY is folded into transform, so reading translateY gives undefined",
        "[KN-159] scene '" + name + "': 'rise' is a style object (transform, opacity); it has no color, so reading color gives undefined",
      ]);
      expect(lines[lines.indexOf(kn[0]) + 1]).toBe('  ↳ Suggestion: For the number, give translateY its own keyframes entry or call styleAt().');
      expect(lines[lines.indexOf(kn[1]) + 1]).toBe('  ↳ Suggestion: Read the keys it has, or bind the whole object with data-bind-style="rise".');
    }
  });

  it('keyframes: tracks become computeds of local, a style object or one value, the same in any seek order', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {
      keyframes: {
        title: {
          opacity: { at: [0, 1, 2, 3], to: [0, 1, 1, 0] },
          translateY: { at: [0, 1], to: [40, 0], ease: 'power1.in' },
          rotate: { at: [0, 2], to: [0, 90] },
          scale: { at: [0, 2], to: [1, 3] },
        },
        width: { at: [0, 2], to: [0, 100], unit: 'px' },
        count: { at: [0, 2], to: [0, 1000], round: true },
      },
    });
    const host = await mount(`<div data-composition-id="r12" data-start="0" data-duration="10">
      <div data-component="${name}" data-start="1" data-duration="3"><h1 data-bind-style="title"></h1><b class="w" data-bind="width"></b><b class="c" data-bind="count"></b></div>
    </div>`);
    cleanup.push(host);
    const snap = async (t) => {
      await at(wf, t);
      const h = host.querySelector('h1');
      return [h.style.opacity, h.style.transform, host.querySelector('.w').textContent, host.querySelector('.c').textContent].join(' | ');
    };
    const first = {}; for (const t of [1.5, 3.5, 2]) first[t] = await snap(t);
    const second = {}; for (const t of [2, 1.5, 3.5]) second[t] = await snap(t);
    expect(second).toEqual(first);
    expect(first[1.5]).toBe('0.5 | translate(0px, 30px) rotate(22.5deg) scale(1.5) | 25px | 250');
    expect(first[2]).toBe('1 | translate(0px, 0px) rotate(45deg) scale(2) | 50px | 500');
    expect(first[3.5]).toBe('0.5 | translate(0px, 0px) rotate(90deg) scale(3) | 100px | 1000');
    expectKN(() => wf.kinetic.scene(uniqueName('bad'), { keyframes: { x: { at: [1, 0], to: [0, 1] } } }), 'KN-120', /scene\('bad-\d+'\)\.keyframes\.x\.at\[1\]/, /^at must increase/);
    expectKN(() => wf.kinetic.scene(uniqueName('bad'), { keyframes: { x: { opacity: { at: [0, 1], to: [0, 1], ease: 'zoom' } } } }), 'KN-121', /scene\('bad-\d+'\)\.keyframes\.x\.opacity\.ease/, "'zoom' is not an ease");
    expectKN(() => wf.kinetic.scene(uniqueName('bad'), { keyframes: 5 }), 'KN-120', /scene\('bad-\d+'\)\.keyframes/, /^keyframes is an object/);
    expectKN(() => wf.kinetic.scene(uniqueName('bad'), { keyframes: { x: {} } }), 'KN-120', /scene\('bad-\d+'\)\.keyframes\.x = \{\}/, /^no tracks/);
  });

  it('a scene with text tracks and the 3D transform keys passes check() with no console lines', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const lines = [];
    const kept = {};
    for (const k of ['log', 'info', 'warn', 'error']) { kept[k] = console[k]; console[k] = (...a) => { lines.push(k + ': ' + a.map(String).join(' ')); }; }
    let report, host;
    try {
      wf.kinetic.scene(name, {
        keyframes: {
          card: {
            perspective: { at: [0, 2], to: [900, 900] },
            translateZ: { at: [0, 0.5, 1], to: [0, 80, 0], ease: ['power2.out', 'power2.in'] },
            rotateY: { at: [0, 1], to: [0, 180], ease: 'power2.inOut' },
            skewX: { at: [0, 1], to: [0, 6] },
            scaleY: { at: [0, 1], to: [1, 0.9] },
          },
          panel: {
            clipPath: { at: [0, 0.6, 1.4, 2], to: ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)', 'inset(0% 0% 0% 0%)', 'inset(0% 0% 0% 100%)'], ease: ['power3.out', 'linear', 'power3.in'] },
            filter: { at: [0, 1], to: ['drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.3))', 'drop-shadow(0px 24px 32px rgba(20, 10, 60, 0.45))'], ease: 'spring' },
            fontVariationSettings: { at: [0, 1, 2], to: ['"wght" 200', '"wght" 800', '"wght" 200'], ease: 'sine.inOut' },
          },
          iris: { at: [0, 1.5], to: ['circle(0% at 30% 40%)', 'circle(75% at 50% 50%)'], ease: 'expo.out' },
        },
      });
      host = await mount(`<div data-composition-id="r-tracks" data-start="0" data-duration="2" data-fps="10"><div data-component="${name}" data-start="0">`
        + '<div class="card" data-bind-style="card"></div><div class="panel" data-bind-style="panel"></div><b class="iris" data-bind="iris"></b></div></div>');
      cleanup.push(host);
      await wf.kinetic.ready();
      report = await wf.kinetic.check({ samples: 20 });
    } finally {
      for (const k of Object.keys(kept)) console[k] = kept[k];
    }
    expect(report).toEqual({ ok: true, frames: 20, samples: 20, ready: 'true', errors: 0 });
    expect(lines).toEqual([]);
    wf.kinetic.seek(0.5); await tick(0);
    const css = (prop, v) => { const i = document.createElement('i'); i.style[prop] = v; return i.style[prop]; };
    expect(host.querySelector('.card').style.transform).toBe(css('transform', 'perspective(900px) translateZ(80px) rotateY(90deg) skewX(3deg) scaleY(0.95)'));
    expect(host.querySelector('.panel').style.clipPath).toBe(css('clipPath', wf.kinetic.styleAt(0.5, { c: { at: [0, 0.6], to: ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)'], ease: 'power3.out' } }).c));
    expect(host.querySelector('.iris').textContent).toMatch(/^circle\(\d+(?:\.\d{1,4})?% at \d+(?:\.\d{1,4})?% \d+(?:\.\d{1,4})?%\)$/);
  });

  it('scene(name, definition) validates its arguments', async () => {
    const { wf } = await load();
    expect(() => wf.kinetic.scene('', {})).toThrow(/KN-100/);
    expect(() => wf.kinetic.scene(uniqueName('s'), null)).toThrow(/KN-100/);
  });

  if (BUILD === 'dev') {
    it('warns on reserved names, on a missing reference and on a scene with no timing, and not on a definition with tick() (dev)', async () => {
      const { wf } = await load();
      const lines = await captureWarnings(async () => {
        // tick() alone says nothing: KN-151 waits for video mode (lesson.test.js).
        wf.kinetic.scene(uniqueName('scene'), { tick() {} });
        wf.kinetic.scene(uniqueName('scene'), { state: { local: 1 }, computed: { time() { return 0; } } });
        const a = uniqueName('scene');
        wf.kinetic.scene(a, {});
        const host = await mount(`<div data-composition-id="r11" data-start="0" data-duration="5"><div data-component="${a}" data-start="nothing-here + 1"><b data-bind="local"></b></div></div>`);
        cleanup.push(host);
        const b = uniqueName('scene');
        wf.kinetic.scene(b, {});
        const host2 = await mount(`<div data-component="${b}"><b data-bind="local"></b></div>`);
        cleanup.push(host2);
        wf.kinetic.scene(uniqueName('scene'), { keyframes: { fade: { at: [0, 1], to: [0, 1] } }, computed: { fade() { return 1; } } });
        // A binding on the scene's root tag naming the scene's own computed,
        // inside a parent component: the binding reads the parent, which a
        // development core reports (WF-521); Kinetic says nothing.
        const frame = uniqueName('frame');
        wf.component(frame, {});
        const c = uniqueName('scene');
        wf.kinetic.scene(c, { computed: { bg() { return { background: '#123' }; } } });
        const host3 = await mount(`<div data-component="${frame}"><div data-composition-id="r11b" data-start="0" data-duration="5"><div data-component="${c}" data-start="0" data-bind-style="bg"></div><div data-component="${c}" data-start="0" data-bind-style="bg"></div></div></div>`);
        cleanup.push(host3);
        expect(host3.querySelector('[data-composition-id] [data-component]').getAttribute('style')).toBe(null);
        // A scene with no parent component reads its own values on its root
        // (the framework's rule for a top-level component): no warning.
        const e = uniqueName('scene');
        wf.kinetic.scene(e, { computed: { bg() { return { background: 'rgb(1, 2, 3)' }; } } });
        const host5 = await mount(`<div data-composition-id="r11d" data-start="0" data-duration="5"><div data-component="${e}" data-start="0" data-bind-style="bg"></div></div>`);
        cleanup.push(host5);
        expect(host5.querySelector('[data-component]').getAttribute('style')).toBe('background: rgb(1, 2, 3);');
        // One naming the parent's value is fine.
        const d = uniqueName('scene');
        wf.kinetic.scene(d, {});
        const host4 = await mount(`<div data-composition-id="r11c" data-start="0" data-duration="5"><div data-component="${d}" data-start="0" data-show="parentFlag"></div></div>`);
        cleanup.push(host4);
        // A scene inside another scene: a binding on its root naming one of
        // Kinetic's own values reads the outer scene's, which has it too, so
        // the core cannot tell; Kinetic warns (KN-154), once for two tags.
        const outer = uniqueName('scene'), inner = uniqueName('scene');
        wf.kinetic.scene(outer, {});
        wf.kinetic.scene(inner, {});
        const tag = `<div data-component="${inner}" data-start="1" data-duration="2" data-bind-style="{ opacity: progress }"></div>`;
        const host6 = await mount(`<div data-composition-id="r11e" data-start="0" data-duration="5"><div data-component="${outer}" data-start="0">${tag}${tag}</div></div>`);
        cleanup.push(host6);
        await tick(20);
      });
      const codes = lines.filter((l) => l.startsWith('[KN-')).map((l) => l.slice(1, 7));
      expect(codes, lines.filter((l) => l.startsWith('[KN-')).join(' || ')).toEqual(['KN-152', 'KN-113', 'KN-112', 'KN-153', 'KN-154']);
      const at154 = lines.findIndex((l) => l.includes('KN-154'));
      expect(lines[at154]).toMatch(/data-bind-style="\{ opacity: progress \}" on its root tag reads 'progress' of 'scene-\d+', not its own/);
      expect(lines[at154]).toMatch(/sits inside the scene 'scene-\d+'/);
      expect(lines[at154 + 1]).toMatch(/root: \{ style: \{ opacity: 'progress' \} \}/);   // the suggestion follows on its own line
      // The frame component's case is the core's: WF-521 from a development core.
      const wf521 = lines.filter((l) => l.startsWith('[WF-521]'));
      expect(wf521.length).toBe(/\.dev\.js$/.test(CORE) ? 1 : 0);
      if (wf521.length) expect(wf521[0]).toMatch(/data-bind-style="bg" on the root of 'scene-\d+' is read by 'frame-\d+'/);
      expect(lines.find((l) => l.includes('KN-152'))).toMatch(/'time', 'local'|'local', 'time'/);
      expect(lines.find((l) => l.includes('KN-153'))).toMatch(/in both keyframes and computed; the keyframes entry/);
    });
  }
});
