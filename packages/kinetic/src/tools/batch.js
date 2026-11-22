/**
 * render.batch(rows, options): the page rendered once per row, each row's
 * fields the composition's variables for that render, one MP4 per row.
 *
 *   const done = await wildflower.kinetic.render.batch(rows, {
 *     name: 'name',          the row field that names each file
 *                            (default <composition id>-<row number>)
 *     save: 'folder',        'folder': one file per row into a folder the
 *                            author picks (showDirectoryPicker); 'download':
 *                            one download per row; false: Blobs returned.
 *                            Default 'folder' where the browser has the
 *                            picker and the call comes from a click, else
 *                            'download'
 *     timeout: 60,           seconds for each row's page to get ready
 *     signal,                an AbortSignal: aborting it stops the batch,
 *                            which rejects with the signal's reason, the
 *                            rows done on it as `results`
 *     onRow(info),           { index, count, row, name, phase, frame, frames }:
 *                            phase 'loading', 'rendering' (each frame) and
 *                            'saved'
 *     fps, codec, bitrate, shutter, finish, from, to, width, height,
 *     audio, audioCodec, audioBitrate, alpha     passed to render()
 *   });
 *   // [{ row, index, name }, ...], each with its blob when save is false
 *
 * alpha, or this page's config({ alpha }) when it is not given, goes to
 * every row, so a batch with it on makes a MOV per row, named .mov.
 *
 * `rows` is an array of objects, an object with a `rows` array, or a File or
 * Blob of either as JSON, or of CSV: a header row of ids, then a row per
 * video, every value text, which Kinetic converts to the input's declared
 * type (a Number input reads "0.1" as 0.1). A Blob is CSV when its name ends
 * in .csv or its type says so, JSON when its name or type says that, and
 * otherwise JSON when it starts with [ or {.
 *
 * Each row renders in a hidden frame of this page, at the composition's
 * size, named 'kinetic-batch:' and the row as JSON, which the frame's
 * Kinetic reads as its variables (timing.js, readVariables()). The rows go
 * one at a time. The two talk by postMessage alone, since a page opened
 * from disk gives every frame an opaque origin and neither side can reach
 * into the other:
 *
 *   frame -> parent  { type: 'kinetic-batch-hello' }      the frame's page has loaded
 *   parent -> frame  { type: 'kinetic-batch-render', options }
 *                                                         ready(), then render(options)
 *                                                         with no download; taken once
 *   frame -> parent  { type: 'kinetic-batch-ready' }      readiness passed, the render starts
 *                    { type: 'kinetic-batch-progress', frame, frames }
 *                    { type: 'kinetic-batch-done', blob, name, frames }
 *                    { type: 'kinetic-batch-failed', code, where, message, lines }
 *
 * Each side takes messages from the other's window alone: the frame from
 * its parent, the batch from the frame it made. Both post with '*'. A row whose inputs fail (KN-130),
 * whose readiness fails or whose render throws stops the batch: the call
 * rejects with that row's code, its where led by the row's number, and on
 * the error `index`, `row`, `lines` (the KN lines and errors its page
 * printed) and `results` (the rows done, already saved). A row's page that
 * does not get ready within the timeout, or that has no Kinetic to answer,
 * is KN-104; so is one that, once ready, loads another page or sends no word
 * for the timeout (30 s at least, where a frame's worth of work is far less),
 * and so is a file that cannot be read back or written. Options
 * are checked before anything renders (KN-100). Each file is read back, a
 * few bytes from its start, middle and end, before it is saved, since a
 * Chrome just launched can hand back a large Blob it cannot read.
 */

import { CODES, fail, show } from '../diagnostics.js';
import { compositionRoot } from '../timing.js';

const PREFIX = 'kinetic-batch-';
const OWN = ['name', 'save', 'timeout', 'onRow', 'signal'];
const PASSED = ['fps', 'codec', 'bitrate', 'shutter', 'finish', 'from', 'to', 'width', 'height', 'audio', 'audioCodec', 'audioBitrate', 'alpha'];
// Laid out and painted at its size, so its footage presents frames and its
// animation frames run, under the page and out of the pointer's way.
const HIDDEN = 'position:fixed;left:0;top:0;border:0;margin:0;padding:0;z-index:-2147483647;pointer-events:none;clip-path:inset(0 calc(100% - 1px) calc(100% - 1px) 0);';

const bad = (k, why) => fail(CODES.BAD_CALL, 'render.batch({ ' + k + ' })', why);

// A CSV with a header row of ids. Quoted fields may hold commas, quotes
// (doubled) and line breaks.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
  if (!header) return [];
  const ids = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(ids.map((id, i) => [id, r[i] === undefined ? '' : r[i]])));
}

// The rows, from an array, an object with a rows array, or a file of either
// or of CSV.
async function readRows(rows) {
  let data = rows;
  if (rows && typeof rows.text === 'function' && typeof rows.size === 'number') {
    const text = (await rows.text()).replace(/^﻿/, '');
    const name = rows.name || '', type = rows.type || '';
    const csv = /\.csv$/i.test(name) || /csv/.test(type) || (!/\.json$/i.test(name) && !/json/.test(type) && !/^\s*[[{]/.test(text));
    if (csv) data = parseCsv(text);
    else {
      try { data = JSON.parse(text); } catch (e) { throw fail(CODES.BAD_CALL, 'render.batch(rows)', __DEV__ && (name || 'the file') + ' is not JSON (' + e.message + '), nor named .csv'); }
    }
  }
  const list = Array.isArray(data) ? data : data && Array.isArray(data.rows) ? data.rows : null;
  if (!list) throw fail(CODES.BAD_CALL, 'render.batch(rows)', __DEV__ && 'rows is an array of objects, an object with a rows array, or a JSON or CSV file of them, not ' + show(data));
  const at = list.findIndex((r) => !r || typeof r !== 'object' || Array.isArray(r));
  if (at >= 0) throw fail(CODES.BAD_CALL, 'render.batch(rows)', __DEV__ && 'row ' + (at + 1) + ' is not an object of variables: ' + show(list[at]));
  if (!list.length) throw fail(CODES.BAD_CALL, 'render.batch(rows)', __DEV__ && 'there are no rows');
  return list;
}

// A file name from the row's field: letters and digits of any alphabet,
// dots, dashes and underscores, without the extension it is about to be
// given, and unique within the batch whatever its case, since a folder on
// macOS or Windows takes Clip.mp4 and clip.mp4 as one file.
function fileName(row, i, field, id, taken, ext) {
  const v = field !== undefined && row[field] !== undefined && row[field] !== null ? String(row[field]).trim() : '';
  let base = v.replace(/[^\p{L}\p{N}_.-]+/gu, '-');
  if (base.toLowerCase().endsWith(ext)) base = base.slice(0, -ext.length);
  base = base.replace(/^[-.]+|[-.]+$/g, '');
  if (!base) base = (id || 'video') + '-' + (i + 1);
  let name = base, n = 2;
  while (taken.has(name.toLowerCase())) name = base + '-' + n++;
  taken.add(name.toLowerCase());
  return name + ext;
}

// One row in a frame of its own: resolves with the frame's { blob, name,
// frames }, or rejects with { code, where, message, lines } as the frame
// sent it, or with { timeout } when the frame did not get ready in time.
function renderRow(row, options, size, seconds, progress, signal) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = HIDDEN + 'width:' + size[0] + 'px;height:' + size[1] + 'px';
    let timer = setTimeout(() => end(reject, { timeout: true }), seconds * 1000);
    // The batch's signal aborted: the row's frame goes, and its render with it.
    const halted = () => end(reject, { aborted: true });
    if (signal) signal.addEventListener('abort', halted);
    function end(settle, value) {
      clearTimeout(timer);
      self.removeEventListener('message', heard);
      if (signal) signal.removeEventListener('abort', halted);
      frame.remove();
      settle(value);
    }
    // Once the page is ready it sends word with every frame. One that goes quiet for the timeout (30 s at
    // least), or whose frame loads a second page, is gone, and the row fails where it would wait for good.
    const quiet = () => { clearTimeout(timer); timer = setTimeout(() => end(reject, { gone: true }), Math.max(seconds, 30) * 1000); };
    let loads = 0, ready = false;
    frame.addEventListener('load', () => { if (++loads > 1 && ready) end(reject, { gone: true }); });
    function heard(e) {
      const d = e.data;
      if (e.source !== frame.contentWindow || !d || typeof d.type !== 'string' || !d.type.startsWith(PREFIX)) return;
      const t = d.type.slice(PREFIX.length);
      if (t === 'hello') {
        try { e.source.postMessage({ type: PREFIX + 'render', options }, '*'); } catch (err) { end(reject, { message: String(err && err.message || err) }); }
      } else if (t === 'ready') { ready = true; quiet(); }
      else if (t === 'progress') { quiet(); progress(d.frame, d.frames); }
      else if (t === 'done') end(resolve, d);
      else if (t === 'failed') end(reject, d);
    }
    self.addEventListener('message', heard);
    // The name first, so the frame's page reads its row as it starts.
    frame.name = 'kinetic-batch:' + JSON.stringify(row);
    frame.src = location.href.replace(/#.*$/, '');
    document.body.appendChild(frame);
  });
}

// Reads a few bytes from the start, middle and end of the file, so a Blob
// Chrome cannot read fails here, with a code, and not as a broken file.
async function readBack(blob) {
  for (const at of [0, Math.floor(blob.size / 2), Math.max(0, blob.size - 16)]) await blob.slice(at, at + 16).arrayBuffer();
}

export function createBatch(k) {
  // The frame's side, which kinetic.wf.js (batch.js) starts in a batch frame
  // once its page has loaded, with the lines the page has printed so far,
  // a list it goes on filling.
  function batchFrame(lines) {
    const post = (type, m) => parent.postMessage(Object.assign({ type: PREFIX + type }, m), '*');
    let taken = false;
    self.addEventListener('message', (e) => {
      const d = e.data;
      if (taken || e.source !== parent || !d || d.type !== PREFIX + 'render') return;
      taken = true;
      k.ready()
        .then(() => {
          post('ready');
          return k.render(Object.assign({}, d.options, { download: false, onProgress: (frame, frames) => post('progress', { frame, frames }) }));
        })
        .then((r) => post('done', { blob: r.blob, name: r.name, frames: r.frames }),
          (err) => post('failed', { code: (err && err.code) || null, where: (err && err.where) || null, message: String((err && err.message) || err), lines }));
    });
    post('hello');
  }

  return { batch, batchFrame };

  async function batch(rows, opts) {
    const o = opts || {};
    if (typeof o !== 'object') throw bad('options', __DEV__ && 'options is an object, not ' + show(opts));
    for (const k in o) if (!OWN.includes(k) && !PASSED.includes(k)) throw bad(k, __DEV__ && "'" + k + "' is not an option of render.batch(); the options are " + OWN.concat(PASSED).join(', '));
    if (o.name !== undefined && typeof o.name !== 'string') throw bad('name', __DEV__ && 'name is the row field that names each file, a string, not ' + show(o.name));
    if (o.save !== undefined && o.save !== 'folder' && o.save !== 'download' && o.save !== false) throw bad('save', __DEV__ && "save is 'folder', 'download' or false, not " + show(o.save));
    if (o.timeout !== undefined && !(typeof o.timeout === 'number' && o.timeout > 0 && o.timeout < Infinity)) throw bad('timeout', __DEV__ && 'timeout is seconds above 0, not ' + show(o.timeout));
    if (o.onRow !== undefined && typeof o.onRow !== 'function') throw bad('onRow', __DEV__ && 'onRow is a function, not ' + show(o.onRow));
    // signal, an AbortSignal as render() and fetch() take: aborting it stops the row being rendered and rejects
    // with its reason, the rows done so far on it as `results`; one already aborted rejects before anything.
    const signal = o.signal;
    if (signal !== undefined && !(typeof AbortSignal === 'function' && signal instanceof AbortSignal)) throw bad('signal', __DEV__ && 'signal is an AbortSignal, such as new AbortController().signal, not ' + show(signal));
    const results = [];
    const halt = () => { const why = signal.reason; return why && typeof why === 'object' ? Object.assign(why, { results }) : why; };
    if (signal && signal.aborted) throw halt();
    const picker = typeof self.showDirectoryPicker === 'function';
    const act = navigator.userActivation;
    const save = o.save !== undefined ? o.save : picker && act && act.isActive ? 'folder' : 'download';
    if (save === 'folder' && !picker) throw bad('save', __DEV__ && "this browser has no showDirectoryPicker() to pick a folder with; use save: 'download' or false");
    const list = await readRows(rows);
    // A row's frame loads this page by its address, and a page made from text (a srcdoc frame, about:blank) has none.
    if (location.protocol === 'about:') throw fail(CODES.BATCH, 'render.batch()', __DEV__ && 'this page has no address of its own (' + location.href + '), so a frame cannot load it again for each row; batch from a page that is a file or has a URL');
    const root = compositionRoot(document);
    if (!root) throw fail(CODES.BAD_CALL, 'render.batch(): data-composition-id', __DEV__ && 'no composition root (an element with data-composition-id) on the page');
    const id = root.getAttribute('data-composition-id');
    const size = [Number(root.getAttribute('data-width')) || root.offsetWidth || 1920, Number(root.getAttribute('data-height')) || root.offsetHeight || 1080];
    const seconds = o.timeout === undefined ? 60 : o.timeout;
    const options = {};
    for (const k of PASSED) if (o[k] !== undefined) options[k] = o[k];
    // alpha, else this page's config({ alpha }), passed to every row, whose
    // page is this one loaded again and has only what its scripts set: a
    // MOV per row, named .mov. render() checks the value.
    if (options.alpha === undefined) options.alpha = k.config().alpha;
    if (typeof options.alpha !== 'boolean') throw bad('alpha', __DEV__ && 'alpha is true (a MOV of PNG frames with transparency per row) or false (an MP4 per row), not ' + show(o.alpha));
    const ext = options.alpha ? '.mov' : '.mp4';
    // Picked before the first row, while the click that called this still
    // counts; a picker the author closes rejects with its AbortError.
    const dir = save === 'folder' ? await self.showDirectoryPicker({ id: 'kinetic-batch', mode: 'readwrite' }) : null;
    const taken = new Set();
    for (let i = 0; i < list.length; i++) {
      if (signal && signal.aborted) throw halt();
      const row = list[i], name = fileName(row, i, o.name, id, taken, ext);
      const where = 'render.batch(): row ' + (i + 1);
      const report = (phase, frame, frames) => { if (o.onRow) o.onRow({ index: i, count: list.length, row, name, phase, frame, frames }); };
      // The row's failure, with the row and what came before it.
      const stop = (err, lines) => Object.assign(err, { index: i, row, lines: lines || [], results });
      report('loading');
      let r;
      try {
        r = await renderRow(row, options, size, seconds, (f, n) => report('rendering', f, n), signal);
      } catch (d) {
        if (d.aborted) throw halt();
        if (d.timeout) throw stop(fail(CODES.BATCH, where, __DEV__ && "the row's page did not get ready within " + seconds + ' s, or has no Kinetic to answer; raise timeout for a page that loads slowly'));
        if (d.gone) throw stop(fail(CODES.BATCH, where, __DEV__ && "the row's page went away or stopped answering while it rendered"));
        // The row's own code when it is one of Kinetic's; an error of the browser's (its code a number) is the batch's.
        // Its message without the code and place it leads with, which this error's own lead already holds.
        throw stop(fail(typeof d.code === 'string' && d.code.startsWith('KN-') ? d.code : CODES.BATCH, where + (d.where ? ', ' + d.where : ''), __DEV__ && String(d.message).replace('[' + d.code + '] ' + d.where + ': ', '')), d.lines);
      }
      try {
        await readBack(r.blob);
        if (dir) {
          const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
          await w.write(r.blob);
          await w.close();
        } else if (save === 'download') {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(r.blob);
          a.download = name;
          a.click();
          // Long enough for the browser's question about several downloads.
          setTimeout(() => URL.revokeObjectURL(a.href), 60000);
        }
      } catch (e) {
        throw stop(fail(CODES.BATCH, where + ', ' + name, __DEV__ && 'the file could not be ' + (dir ? 'written' : 'read back') + ' (' + String(e && e.message || e) + ')'));
      }
      const entry = { row, index: i, name };
      if (save === false) entry.blob = r.blob;
      results.push(entry);
      report('saved');
    }
    return results;
  }
}
