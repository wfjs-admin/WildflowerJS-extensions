/**
 * render.batch() without rendering: a frame named 'kinetic-batch:' and a row
 * reads the row over the page's defaults, and only inside a frame; a name
 * that holds no row leaves the defaults; a batch frame takes the render
 * message from its parent alone, and the batch takes a frame's answers from
 * that frame alone; the options and the rows are checked (KN-100); a row
 * that fails stops the batch with its code, its row and its lines; the
 * preview bar's Render batch shows only with variables and drives the call.
 * The renders themselves are in batch-render.test.js, in the render suite.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, expectKN, BUILD, CORE, WF_FILE, CORE_TIER } from './helpers.js';

const dev = BUILD === 'dev';
const abs = (u) => new URL(u, location.href).href;
const PAGE = abs('/packages/kinetic/test/fixtures/batch-page.html') + '?core=' + encodeURIComponent(abs(CORE)) + '&wf=' + encodeURIComponent(abs(WF_FILE));

const cleanup = [];
const restores = [];
afterEach(async () => {
  for (const f of restores.splice(0)) f();
  for (const el of cleanup.splice(0)) (el.close || el.remove).call(el);
  const { wf } = await load();
  wf.kinetic.config({ preview: false });
});

// The fixture page in a frame, named `name` when given; resolves once its
// readiness has settled.
async function page(name, extra = '') {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:180px;border:0;pointer-events:none';
  if (name !== undefined) frame.name = name;
  const loaded = new Promise((r) => { frame.onload = r; });
  frame.src = PAGE + extra;
  document.body.appendChild(frame);
  cleanup.push(frame);
  await loaded;
  const w = frame.contentWindow;
  await w.wildflower.kinetic.ready().catch(() => {});
  await tick(20);
  return { frame, w, doc: w.document };
}
const shown = (doc) => ({
  label: doc.getElementById('label').textContent,
  color: doc.querySelector('[data-component="card"]').style.background,
  width: doc.getElementById('bar').style.width,
  flag: doc.getElementById('flag').style.display !== 'none',
});

// Messages that reach this window from `from`, by type.
function heard(from) {
  const got = [];
  const on = (e) => { if (e.source === from && e.data && typeof e.data.type === 'string') got.push(e.data); };
  addEventListener('message', on);
  restores.push(() => removeEventListener('message', on));
  return got;
}
const until = async (fn, ms = 10000) => { for (let t = 0; !fn() && t < ms; t += 20) await tick(20); return fn(); };

describe(`render.batch()'s frames (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a frame named kinetic-batch: and a row reads the row over the declared defaults, converted to each input\'s type', async () => {
    const { doc } = await page('kinetic-batch:' + JSON.stringify({ label: 'ROW', color: '#ff0000', share: '0.25', flag: 'true' }));
    expect(shown(doc)).toEqual({ label: 'ROW', color: 'rgb(255, 0, 0)', width: '80px', flag: true });
  });

  it('a frame with another name, or none, reads the defaults', async () => {
    const { doc } = await page('other:' + JSON.stringify({ label: 'ROW' }));
    expect(shown(doc)).toEqual({ label: 'DEFAULT', color: 'rgb(0, 0, 255)', width: '160px', flag: false });
  });

  it('a name whose JSON holds no row reads the defaults, with KN-104 in development', async () => {
    const { w, doc } = await page('kinetic-batch:{not json');
    expect(shown(doc)).toEqual({ label: 'DEFAULT', color: 'rgb(0, 0, 255)', width: '160px', flag: false });
    // A development core keeps the lines it printed in wildflower.diagnostics.
    const codes = (w.wildflower.diagnostics || []).map((d) => d.code);
    if (dev && w.wildflower.diagnostics) expect(codes.filter((c) => c === 'KN-104')).toHaveLength(1);
    else expect(codes).not.toContain('KN-104');
  });

  it('a top-level window with that name is no batch frame: it reads the defaults', async () => {
    const w = window.open(PAGE, 'kinetic-batch:' + JSON.stringify({ label: 'ROW' }), 'width=400,height=300');
    expect(w, 'the browser opened the window').toBeTruthy();
    cleanup.push(w);
    await until(() => w.wildflower && w.wildflower.kinetic && w.document.readyState === 'complete');
    await w.wildflower.kinetic.ready().catch(() => {});
    await tick(20);
    expect(w.name.startsWith('kinetic-batch:')).toBe(true);
    expect(w.document.getElementById('label').textContent).toBe('DEFAULT');
  });

  it('a batch frame says hello to its parent, takes the render message from its parent alone, and answers once', async () => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:180px;border:0;pointer-events:none';
    frame.name = 'kinetic-batch:' + JSON.stringify({ label: 'ROW' });
    const loaded = new Promise((r) => { frame.onload = r; });
    frame.src = PAGE;
    document.body.appendChild(frame);
    cleanup.push(frame);
    const w = frame.contentWindow;
    const got = heard(w);
    await loaded;
    expect(await until(() => got.some((m) => m.type === 'kinetic-batch-hello'))).toBe(true);
    // From a sibling frame: the message's source is that frame's window.
    const other = document.createElement('iframe');
    document.body.appendChild(other);
    cleanup.push(other);
    other.contentWindow.Function('w', 'w.postMessage({ type: "kinetic-batch-render", options: {} }, "*")')(w);
    await tick(1500);
    expect(got.map((m) => m.type)).toEqual(['kinetic-batch-hello']);
    // From the parent: readiness, then the render's outcome. This browser's
    // render may fail (no WebCodecs or no HTML-in-Canvas), which is an answer too.
    w.postMessage({ type: 'kinetic-batch-render', options: { fps: 10 } }, '*');
    expect(await until(() => got.some((m) => m.type === 'kinetic-batch-done' || m.type === 'kinetic-batch-failed'), 30000)).toBe(true);
    expect(got[1].type).toBe('kinetic-batch-ready');
    const end = got.find((m) => m.type === 'kinetic-batch-done' || m.type === 'kinetic-batch-failed');
    if (end.type === 'kinetic-batch-failed') {
      expect(['KN-200', 'KN-201']).toContain(end.code);
      expect(end.where).toBe('render()');
      expect(Array.isArray(end.lines)).toBe(true);
    } else expect(end.blob.size).toBeGreaterThan(0);
    // A second render message is not taken.
    const n = got.length;
    w.postMessage({ type: 'kinetic-batch-render', options: {} }, '*');
    await tick(500);
    expect(got.length).toBe(n);
    // No bar, and the clock was not started.
    expect(w.document.querySelector('[data-kinetic-preview]')).toBeNull();
    expect(w.wildflower.kinetic.config().autoplay).toBe(false);
  });
});

describe(`render.batch() (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('checks its options and its rows before anything renders (KN-100)', async () => {
    const { w } = await page();
    const b = w.wildflower.kinetic.render.batch;
    await expectKN(b([{}], { nope: 1 }), 'KN-100', 'render.batch({ nope })', "'nope' is not an option");
    await expectKN(b([{}], { save: 'disk' }), 'KN-100', 'render.batch({ save })', "save is 'folder', 'download' or false");
    await expectKN(b([{}], { timeout: 0 }), 'KN-100', 'render.batch({ timeout })', 'timeout is seconds above 0');
    await expectKN(b([{}], { name: 3 }), 'KN-100', 'render.batch({ name })', 'name is the row field');
    await expectKN(b([{}], { signal: 5 }), 'KN-100', 'render.batch({ signal })', 'signal is an AbortSignal');
    // A signal already aborted rejects with its reason, before any row's frame is made.
    const gone = new w.AbortController();
    gone.abort();
    const why = await b([{}], { save: false, signal: gone.signal }).then(() => null, (e) => e);
    expect(why).toBe(gone.signal.reason);
    expect(why.name).toBe('AbortError');
    expect(why.results).toEqual([]);
    await expectKN(b('rows'), 'KN-100', 'render.batch(rows)', 'rows is an array of objects');
    await expectKN(b([{ a: 1 }, 2]), 'KN-100', 'render.batch(rows)', 'row 2 is not an object of variables');
    await expectKN(b({ rows: [] }), 'KN-100', 'render.batch(rows)', 'there are no rows');
    await expectKN(b(new w.Blob(['{"rows":'], { type: 'application/json' })), 'KN-100', 'render.batch(rows)', 'is not JSON');
    expect(w.document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('a row that fails stops the batch with its code, its row, its lines, and what was done before it; answers from elsewhere are not taken', async () => {
    const { w } = await page();
    const fake = () => {
      // From this window, not the row's frame: neither is taken.
      w.postMessage({ type: 'kinetic-batch-done', blob: new Blob(['x']), name: 'fake.mp4', frames: 1 }, '*');
      w.postMessage({ type: 'kinetic-batch-failed', code: 'KN-999', where: 'fake', message: 'fake', lines: [] }, '*');
    };
    const seen = [];
    const err = await w.wildflower.kinetic.render.batch([{ label: 'one', share: 2 }, { label: 'two' }], {
      save: false,
      onRow: (i) => { seen.push(i.phase + ' ' + i.index); if (i.phase === 'loading') setTimeout(fake, 0); },
    }).then(() => null, (e) => e);
    expect(err).toBeTruthy();
    // The first row's share is out of its range, so its page fails readiness
    // in a browser that can render and in one that cannot, and the batch
    // stops there.
    expect(err.code).toBe('KN-130');
    expect(err.message.startsWith("[KN-130] render.batch(): row 1, scene 'card' input 'share'")).toBe(true);
    expect(err.index).toBe(0);
    expect(err.row).toEqual({ label: 'one', share: 2 });
    expect(err.results).toEqual([]);
    expect(Array.isArray(err.lines)).toBe(true);
    expect(seen).toEqual(['loading 0']);
    expect(w.document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('rows from a CSV file reach the row\'s frame as text, and a page that never answers is KN-104 after the timeout', async () => {
    const { w } = await page();
    // The frame's address is changed to a page with no Kinetic, which never says hello.
    const names = [];
    const desc = Object.getOwnPropertyDescriptor(w.HTMLIFrameElement.prototype, 'src');
    Object.defineProperty(w.HTMLIFrameElement.prototype, 'src', { configurable: true, set(v) { names.push(this.name); desc.set.call(this, 'about:blank'); }, get() { return desc.get.call(this); } });
    restores.push(() => Object.defineProperty(w.HTMLIFrameElement.prototype, 'src', desc));
    const csv = new w.File(['label,share,flag\n"Ada, L",0.25,true\n'], 'people.csv', { type: '' });
    const started = performance.now();
    const err = await w.wildflower.kinetic.render.batch(csv, { save: false, timeout: 0.5 }).then(() => null, (e) => e);
    expect(performance.now() - started).toBeGreaterThan(450);
    expectKN(err, 'KN-104', 'render.batch(): row 1', 'did not get ready within 0.5 s');
    expect(err.row).toEqual({ label: 'Ada, L', share: '0.25', flag: 'true' });
    expect(names).toEqual(['kinetic-batch:' + JSON.stringify({ label: 'Ada, L', share: '0.25', flag: 'true' })]);
  });
});

describe(`the preview bar's Render batch (${BUILD} extension, ${CORE_TIER} core)`, () => {
  const button = () => document.querySelector('[data-kinetic-preview] [data-kinetic-batch]');
  async function bar(markup) {
    const { wf } = await load();
    wf.kinetic.config({ preview: false });
    const host = await mount(markup);
    cleanup.push(host);
    wf.kinetic.config({ preview: true });
    await tick(10);
    return wf;
  }
  const readout = () => document.querySelector('[data-kinetic-preview] span').textContent;

  it('shows only for a composition with variables or a scene with inputs', async () => {
    await bar('<div data-composition-id="nb1" data-start="0" data-duration="1" data-fps="10"></div>');
    expect(document.querySelector('[data-kinetic-preview]')).not.toBeNull();
    expect(button()).toBeNull();
    cleanup.splice(0).forEach((el) => el.remove());
    await bar('<div data-composition-id="nb2" data-start="0" data-duration="1" data-fps="10" data-composition-variables=\'[{"id":"a","type":"string","default":"x"}]\'></div>');
    expect(button().textContent).toBe('Render batch');
    cleanup.splice(0).forEach((el) => el.remove());
    const { wf } = await load();
    wf.kinetic.scene('nb-inputs', { inputs: { a: String } });
    await bar('<div data-composition-id="nb3" data-start="0" data-duration="1" data-fps="10"></div>');
    expect(button().textContent).toBe('Render batch');
  });

  it('opens a file chooser, renders the file chosen with the row and frame on the readout, and says how it ended', async () => {
    const wf = await bar('<div data-composition-id="nb4" data-start="0" data-duration="1" data-fps="10" data-composition-variables=\'[{"id":"a","type":"string","default":"x"}]\'></div>');
    const file = new File(['a\nx\ny\n'], 'rows.csv', { type: 'text/csv' });
    const chooser = choose(file);
    picker(undefined);
    const calls = [];
    let finish = null, onRow = null, signal = null;
    const realBatch = wf.kinetic.render.batch;
    wf.kinetic.render.batch = (rows, o) => { calls.push([rows, o.save]); onRow = o.onRow; signal = o.signal; return new Promise((ok, no) => { finish = { ok, no }; }); };
    restores.push(() => { wf.kinetic.render.batch = realBatch; });
    button().click();
    expect(chooser.accept).toBe('.json,.csv');
    // With no folder picker in the browser, one download per row.
    expect(calls).toEqual([[file, 'download']]);
    onRow({ index: 1, count: 2, phase: 'rendering', frame: 3, frames: 10 });
    await tick(10);
    expect(readout()).toBe('batch: row 2 of 2, frame 3 / 10');
    // While it runs the button is Cancel, and Check is off.
    expect(button().disabled).toBe(false);
    expect(button().textContent).toBe('Cancel');
    expect(document.querySelector('[data-kinetic-preview] [data-action="check"]').disabled).toBe(true);
    finish.ok([{}, {}]);
    await tick(10);
    expect(readout()).toBe('batch complete: 2 files');
    expect(button().disabled).toBe(false);
    expect(button().textContent).toBe('Render batch');
    expect(signal.aborted).toBe(false);
    // A failure names the row and the code.
    button().click();
    finish.no(Object.assign(new Error('[KN-130] render.batch(): row 2'), { code: 'KN-130', index: 1 }));
    await tick(10);
    expect(readout()).toBe('batch failed, row 2 (KN-130)');
  });

  it('while a batch runs the button is Cancel, which aborts the batch\'s signal; a cancelled batch is no failure', async () => {
    const wf = await bar('<div data-composition-id="nb4c" data-start="0" data-duration="1" data-fps="10" data-composition-variables=\'[{"id":"a","type":"string","default":"x"}]\'></div>');
    choose(new File(['a\nx\ny\n'], 'rows.csv', { type: 'text/csv' }));
    picker(undefined);
    let finish = null, signal = null, calls = 0;
    const realBatch = wf.kinetic.render.batch;
    wf.kinetic.render.batch = (rows, o) => { calls++; signal = o.signal; return new Promise((ok, no) => { finish = { ok, no }; }); };
    restores.push(() => { wf.kinetic.render.batch = realBatch; });
    button().click();
    await tick(10);
    expect(button().textContent).toBe('Cancel');
    expect(signal.aborted).toBe(false);
    button().click();
    expect(signal.aborted).toBe(true);
    expect(calls).toBe(1);
    finish.no(signal.reason);
    await tick(10);
    expect(readout()).toBe('batch cancelled');
    expect(button().textContent).toBe('Render batch');
  });

  it('with a folder picker and the click used up by the file chooser, the button asks for a second click, Choose folder', async () => {
    const wf = await bar('<div data-composition-id="nb5" data-start="0" data-duration="1" data-fps="10" data-composition-variables=\'[{"id":"a","type":"string","default":"x"}]\'></div>');
    const file = new File(['[{"a":"x"}]'], 'rows.json', { type: 'application/json' });
    choose(file);
    picker(() => Promise.reject(new Error('not called here')));
    activation(false);
    const calls = [];
    const realBatch = wf.kinetic.render.batch;
    wf.kinetic.render.batch = (rows, o) => { calls.push([rows, o.save]); return Promise.resolve([{}]); };
    restores.push(() => { wf.kinetic.render.batch = realBatch; });
    button().click();
    await tick(10);
    expect(calls).toHaveLength(0);
    expect(button().textContent).toBe('Choose folder');
    expect(readout()).toBe('rows.json: choose the folder');
    button().click();
    await tick(10);
    expect(calls).toEqual([[file, 'folder']]);
    expect(button().textContent).toBe('Render batch');
    expect(readout()).toBe('batch complete: 1 file');
  });

  it('with a folder picker and the click still counting, goes straight to the folder', async () => {
    const wf = await bar('<div data-composition-id="nb6" data-start="0" data-duration="1" data-fps="10" data-composition-variables=\'[{"id":"a","type":"string","default":"x"}]\'></div>');
    const file = new File(['[{"a":"x"}]'], 'rows.json', { type: 'application/json' });
    choose(file);
    picker(() => Promise.reject(new Error('not called here')));
    activation(true);
    const calls = [];
    const realBatch = wf.kinetic.render.batch;
    wf.kinetic.render.batch = (rows, o) => { calls.push([rows, o.save]); return Promise.resolve([{}]); };
    restores.push(() => { wf.kinetic.render.batch = realBatch; });
    button().click();
    await tick(10);
    expect(calls).toEqual([[file, 'folder']]);
  });
});

// The bar's file chooser, answered with `file` at once.
function choose(file) {
  const real = HTMLInputElement.prototype.click;
  const seen = { accept: null };
  HTMLInputElement.prototype.click = function () {
    if (this.type !== 'file') return real.call(this);
    seen.accept = this.accept;
    const dt = new DataTransfer();
    dt.items.add(file);
    this.files = dt.files;
    this.dispatchEvent(new Event('change'));
  };
  restores.push(() => { HTMLInputElement.prototype.click = real; });
  return seen;
}
// self.showDirectoryPicker as `fn`, or absent for undefined.
function picker(fn) {
  const had = Object.getOwnPropertyDescriptor(self, 'showDirectoryPicker');
  Object.defineProperty(self, 'showDirectoryPicker', { configurable: true, writable: true, value: fn });
  restores.push(() => { if (had) Object.defineProperty(self, 'showDirectoryPicker', had); else delete self.showDirectoryPicker; });
}
// navigator.userActivation.isActive as `on`.
function activation(on) {
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: on } });
  restores.push(() => { delete navigator.userActivation; });
}

describe(`render.batch() loading the tools (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a tools file that does not load rejects with KN-103 naming render.batch()', async () => {
    const { w } = await page();
    const url = new URL(WF_FILE.replace(/kinetic\.wf(\.min)?\.js$/, 'kinetic.tools$1.js'), location.href).href;
    const real = w.Node.prototype.appendChild;
    w.Node.prototype.appendChild = function (n) {
      if (n instanceof w.HTMLScriptElement && n.src === url) n.src = url.replace(/kinetic\.tools/, 'no-such-file');
      return real.call(this, n);
    };
    try {
      await expectKN(w.wildflower.kinetic.render.batch([{}]), 'KN-103', 'render.batch(): ' + url, 'the file did not load');
    } finally {
      w.Node.prototype.appendChild = real;
    }
  });
});
