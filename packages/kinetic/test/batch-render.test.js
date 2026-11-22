/**
 * render.batch() rendering: the fixture page (fixtures/batch-page.html) once
 * per row, each MP4 decoded and its frame read, so the row's color, the bar
 * its share sets and the flag its Boolean shows are in the picture; rows
 * from an array, a JSON file and a CSV file whose text Kinetic converts; the
 * files named by a field; save: false returning the Blobs and save: 'folder'
 * writing them through the folder picker; a failing row stopping the batch
 * with the rows before it kept; and a page whose frames have opaque origins
 * (a sandboxed frame, as a page opened from disk is) rendering by
 * postMessage alone. Needs WebCodecs and HTML-in-Canvas: the render suite.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { tick, seekVideo, BUILD, CORE, WF_FILE, CORE_TIER } from './helpers.js';

const abs = (u) => new URL(u, location.href).href;
const PAGE = abs('/packages/kinetic/test/fixtures/batch-page.html') + '?core=' + encodeURIComponent(abs(CORE)) + '&wf=' + encodeURIComponent(abs(WF_FILE));

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

async function page(extra = '', sandbox = null) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;border:0;pointer-events:none';
  if (sandbox !== null) frame.setAttribute('sandbox', sandbox);
  const loaded = new Promise((r) => { frame.onload = r; });
  frame.src = PAGE + extra;
  document.body.appendChild(frame);
  cleanup.push(frame);
  await loaded;
  const w = frame.contentWindow;
  if (sandbox === null) await w.wildflower.kinetic.ready();
  return { frame, w };
}

// The middle frame of an MP4: the root's color at the left, below the bar;
// whether the bar is white at x = 40 and at x = 280; whether the flag's
// green is in the bottom right corner.
async function picture(blob) {
  const v = document.createElement('video');
  v.muted = true;
  v.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:180px';
  v.src = URL.createObjectURL(blob);
  document.body.appendChild(v);
  cleanup.push(v);
  await new Promise((r, no) => { v.onloadeddata = r; v.onerror = () => no(new Error('the MP4 did not decode')); });
  await seekVideo(v, 0.25, 10);
  const c = document.createElement('canvas');
  c.width = 320; c.height = 180;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(v, 0, 0, 320, 180);
  const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
  const near = (a, b) => a.every((v2, i) => Math.abs(v2 - b[i]) < 40);
  const bg = px(10, 150);
  const name = near(bg, [255, 0, 0]) ? 'red' : near(bg, [0, 0, 255]) ? 'blue' : near(bg, [0, 128, 0]) ? 'green' : String(bg);
  return {
    color: name,
    bar40: near(px(40, 30), [255, 255, 255]),
    bar280: near(px(280, 30), [255, 255, 255]),
    flag: near(px(300, 170), [0, 255, 0]),
    size: [v.videoWidth, v.videoHeight],
  };
}

const ROWS = [
  { label: 'alpha', color: '#ff0000', share: 1, flag: true },
  { label: 'beta', color: '#0000ff', share: 0.25, flag: false },
];

describe(`render.batch() renders (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('an array of rows: one MP4 per row, each showing its row, named by a field, with the Blobs returned and onRow told', async () => {
    const { w } = await page();
    const phases = [];
    const r = await w.wildflower.kinetic.render.batch(ROWS, { name: 'label', save: false, onRow: (i) => phases.push(i.index + ' ' + i.phase + (i.frames ? ' ' + i.frame + '/' + i.frames : '')) });
    expect(r.map((x) => [x.index, x.name, x.row])).toEqual([[0, 'alpha.mp4', ROWS[0]], [1, 'beta.mp4', ROWS[1]]]);
    expect(await picture(r[0].blob)).toEqual({ color: 'red', bar40: true, bar280: true, flag: true, size: [320, 180] });
    expect(await picture(r[1].blob)).toEqual({ color: 'blue', bar40: true, bar280: false, flag: false, size: [320, 180] });
    expect(phases).toEqual(['0 loading', '0 rendering 1/5', '0 rendering 2/5', '0 rendering 3/5', '0 rendering 4/5', '0 rendering 5/5', '0 saved',
      '1 loading', '1 rendering 1/5', '1 rendering 2/5', '1 rendering 3/5', '1 rendering 4/5', '1 rendering 5/5', '1 saved']);
    // The frames are gone, and the page's own clock and markup are as they were.
    expect(w.document.querySelectorAll('iframe')).toHaveLength(0);
    expect(w.document.getElementById('label').textContent).toBe('DEFAULT');
  });

  it('a CSV file: every value text, converted to each input\'s type; files named <composition id>-<row number> without a name field', async () => {
    const { w } = await page();
    const csv = new w.File(['label,color,share,flag\n"Ada, L",#ff0000,0.25,false\nBob,#0000ff,1,true\n'], 'people.csv', { type: 'text/csv' });
    const r = await w.wildflower.kinetic.render.batch(csv, { save: false });
    expect(r.map((x) => x.name)).toEqual(['card-1.mp4', 'card-2.mp4']);
    expect(r[0].row).toEqual({ label: 'Ada, L', color: '#ff0000', share: '0.25', flag: 'false' });
    // Text arriving unconverted would make no bar ('0.25' + '0.25') and show the flag ('false' is truthy).
    expect(await picture(r[0].blob)).toEqual({ color: 'red', bar40: true, bar280: false, flag: false, size: [320, 180] });
    expect(await picture(r[1].blob)).toEqual({ color: 'blue', bar40: true, bar280: true, flag: true, size: [320, 180] });
  });

  it('a JSON file of { rows }, into a folder through the picker, a file per row named by a field and kept unique', async () => {
    const { w } = await page();
    const written = {};
    w.showDirectoryPicker = async () => ({
      getFileHandle: async (name, o) => {
        expect(o).toEqual({ create: true });
        return { createWritable: async () => { const parts = []; return { write: async (b) => { parts.push(b); }, close: async () => { written[name] = new Blob(parts); } }; } };
      },
    });
    const json = new w.Blob([JSON.stringify({ rows: [{ label: 'same', color: '#ff0000' }, { label: 'same', color: '#0000ff' }] })], { type: 'application/json' });
    const r = await w.wildflower.kinetic.render.batch(json, { name: 'label', save: 'folder', fps: 10 });
    expect(r.map((x) => [x.name, 'blob' in x])).toEqual([['same.mp4', false], ['same-2.mp4', false]]);
    expect(Object.keys(written)).toEqual(['same.mp4', 'same-2.mp4']);
    expect((await picture(written['same.mp4'])).color).toBe('red');
    expect((await picture(written['same-2.mp4'])).color).toBe('blue');
  });

  it('a row whose input fails stops the batch with its code, row and lines, after the rows before it', async () => {
    const { w } = await page();
    const err = await w.wildflower.kinetic.render.batch([ROWS[0], { label: 'bad', share: 2 }, ROWS[1]], { save: false }).then(() => null, (e) => e);
    expect(err.code).toBe('KN-130');
    expect(err.message.startsWith("[KN-130] render.batch(): row 2, scene 'card' input 'share'")).toBe(true);
    // The row's own message is not said twice: its code and place lead the line once.
    expect(err.message.match(/\[KN-130\]/g)).toHaveLength(1);
    expect(err.message.match(/input 'share'/g)).toHaveLength(1);
    expect(err.index).toBe(1);
    expect(err.row).toEqual({ label: 'bad', share: 2 });
    expect(err.lines.some((l) => l.includes('[KN-130]'))).toBe(true);
    expect(err.results.map((x) => x.name)).toEqual(['card-1.mp4']);
    expect((await picture(err.results[0].blob)).color).toBe('red');
  });

  // Under ?embed everything beside the composition is hidden, and a row's frame is added beside it: the frame is
  // left showing, since a frame that is not displayed cannot be drawn.
  it('a page under ?embed batches: its rows\' frames are not hidden with what is beside the composition', async () => {
    const { w } = await page('&embed');
    const out = await w.wildflower.kinetic.render.batch([ROWS[0]], { save: false });
    expect(out.map((x) => x.name)).toEqual(['card-1.mp4']);
    expect((await picture(out[0].blob)).color).toBe('red');
  });

  // An error from the row's page that is none of Kinetic's own (the browser's, with a number for its code) is the
  // batch's: KN-104, with the row.
  it('a row that fails with an error of the browser\'s own is KN-104', async () => {
    const { w } = await page();
    const hide = w.document.createElement('style');
    hide.textContent = 'iframe { display: none !important; }';
    w.document.head.appendChild(hide);
    const err = await w.wildflower.kinetic.render.batch([ROWS[0]], { save: false, timeout: 10 }).then(() => null, (e) => e);
    expect(err && err.code).toBe('KN-104');
    expect(err.message.startsWith('[KN-104] render.batch(): row 1')).toBe(true);
    expect(err.index).toBe(0);
  });

  // A row's page that goes away once it is ready (it loads another page) sends no more word: the batch fails
  // with the row, and its frame is removed.
  it('a row whose page goes away after it is ready is KN-104, and the batch settles', async () => {
    const { w } = await page();
    w.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'kinetic-batch-ready') {
        const f = w.document.querySelector('iframe[name^="kinetic-batch:"]');
        if (f) f.src = 'about:blank';
      }
    });
    const err = await Promise.race([
      w.wildflower.kinetic.render.batch([ROWS[0]], { save: false }).then(() => null, (e) => e),
      tick(8000).then(() => 'pending'),
    ]);
    expect(err).not.toBe('pending');
    expect(err && err.code).toBe('KN-104');
    expect(err.index).toBe(0);
    expect(w.document.querySelectorAll('iframe[name^="kinetic-batch:"]').length).toBe(0);
  }, 20000);

  // signal, as render() takes: aborted while the second row renders, the batch rejects with the signal's reason,
  // the first row's file on it, and the row's frame is gone.
  it('a signal aborted midway stops the batch: it rejects with the reason, with the rows done as results', async () => {
    const { w } = await page();
    const stop = new w.AbortController();
    const err = await w.wildflower.kinetic.render.batch([ROWS[0], ROWS[1], ROWS[0]], {
      save: false, signal: stop.signal,
      onRow: (i) => { if (i.index === 1 && i.phase === 'rendering') stop.abort(); },
    }).then(() => null, (e) => e);
    expect(err).toBe(stop.signal.reason);
    expect(err.name).toBe('AbortError');
    expect(err.results.map((x) => x.name)).toEqual(['card-1.mp4']);
    expect(w.document.querySelectorAll('iframe[name^="kinetic-batch:"]').length).toBe(0);
  });

  it('alpha passes to each row: files named .mov, QuickTime files of PNG frames; the page\'s config({ alpha }) names them .mov too', async () => {
    const { w } = await page();
    const names = [];
    const r = await w.wildflower.kinetic.render.batch([ROWS[0]], { name: 'label', save: false, alpha: true, onRow: (i) => { if (i.phase === 'loading') names.push(i.name); } });
    expect(names).toEqual(['alpha.mov']);
    expect(r.map((x) => x.name)).toEqual(['alpha.mov']);
    expect(r[0].blob.type).toBe('video/quicktime');
    const head = new Uint8Array(await r[0].blob.slice(4, 12).arrayBuffer());
    expect(String.fromCharCode(...head)).toBe('ftypqt  ');
    w.wildflower.kinetic.config({ alpha: true });
    try {
      const d = await w.wildflower.kinetic.render.batch([ROWS[1]], { name: 'label', save: false, to: 0.1 });
      expect(d.map((x) => x.name)).toEqual(['beta.mov']);
      // A row's page is this page loaded again, where the page's own
      // config({ alpha }) has not run: the option is passed for it.
      expect(d[0].blob.type).toBe('video/quicktime');
    } finally {
      w.wildflower.kinetic.config({ alpha: false });
    }
  });

  // Folders on macOS and Windows take Clip.mp4 and clip.mp4 as one file, so names differ by more than their case.
  it('file names: unique whatever their case, letters of any alphabet kept, and a name that ends in the extension is not given it twice', async () => {
    const { w } = await page();
    const rows = [{ label: 'Clip' }, { label: 'clip' }, { label: 'Café olé' }, { label: 'done.mp4' }, { label: 'CLIP.MP4' }];
    const r = await w.wildflower.kinetic.render.batch(rows, { name: 'label', save: false, to: 0.1 });
    expect(r.map((x) => x.name)).toEqual(['Clip.mp4', 'clip-2.mp4', 'Café-olé.mp4', 'done.mp4', 'CLIP-3.mp4']);
  }, 30000);

  // A row's frame is the page loaded again. One that batches as it loads would batch again in each row's frame.
  it('a page that batches as it loads renders its rows once: a row\'s frame starts no batch of its own', async () => {
    // The fixture notes each load's depth on the topmost window, which the test runner's own page may be.
    const depths = window.top.__batchDepths = [];
    const { w } = await page('&auto');
    for (let t = 0; !w.__auto && t < 5000; t += 20) await tick(20);
    expect(await w.__auto).toEqual(['card-1.mp4']);
    // The page itself and, one deeper, its row's frame, and nothing inside that.
    expect(depths.length).toBe(2);
    expect(Math.max(...depths) - Math.min(...depths)).toBe(1);
  }, 30000);

  // A page with no address of its own (a srcdoc frame) can render, but a frame cannot load it again for a row.
  it('a batch from a page with no address of its own is KN-104 at once', async () => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;border:0';
    const loaded = new Promise((r) => { frame.onload = r; });
    frame.srcdoc = `<!doctype html><html><head><script src="${abs(CORE)}"></script><script src="${abs(WF_FILE)}"></script></head><body style="margin:0">
<div id="main" data-composition-id="card" data-no-timeline data-start="0" data-duration="0.3" data-fps="10" data-width="160" data-height="90"
  data-composition-variables='[{"id":"color","type":"string","label":"Color","default":"#0000ff"}]' style="position:relative;width:160px;height:90px">
  <div data-component="card" data-start="0" data-bind-style="{ background: color }" style="position:absolute;inset:0"></div></div>
<script>wildflower.kinetic.scene('card', { inputs: { color: String }, computed: { color() { return this.inputs.color; } } });</script></body></html>`;
    document.body.appendChild(frame);
    cleanup.push(frame);
    await loaded;
    const w = frame.contentWindow;
    await w.wildflower.kinetic.ready();
    const t0 = performance.now();
    const err = await w.wildflower.kinetic.render.batch([{ color: '#ff0000' }], { save: false, timeout: 20 }).then(() => null, (e) => e);
    expect(err && err.code).toBe('KN-104');
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(w.document.querySelectorAll('iframe').length).toBe(0);
  }, 30000);

  it('a page with an opaque origin, its frames too, renders by postMessage alone', async () => {
    const { w } = await page('&driver', 'allow-scripts');
    const answer = new Promise((r) => {
      const on = (e) => { if (e.source === w && e.data && /^test-batch-/.test(e.data.type)) { removeEventListener('message', on); r(e.data); } };
      addEventListener('message', on);
    });
    // The page's scripts have run once its load event has fired.
    await tick(200);
    w.postMessage({ type: 'test-batch', rows: ROWS, options: { name: 'label', save: false } }, '*');
    const d = await answer;
    expect(d.type, d.message).toBe('test-batch-done');
    expect(d.results.map((x) => x.name)).toEqual(['alpha.mp4', 'beta.mp4']);
    expect((await picture(d.results[0].blob)).color).toBe('red');
    expect((await picture(d.results[1].blob)).color).toBe('blue');
  });
});
