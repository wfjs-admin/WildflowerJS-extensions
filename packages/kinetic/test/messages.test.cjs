/**
 * Short production errors. Every Kinetic error is thrown or rejected on
 * every build with its code, and its message starts "[KN-xxx] where". The
 * production build ends it with a link to the code's entry on the
 * error-codes page; the development build goes on with ": " and the sentence
 * that explains it. Three checks keep it so:
 *
 *   - the source, parsed with the acorn that the build's terser vendors:
 *     every fail(code, where, detail) has all three arguments; its detail is
 *     __DEV__ && (...), or __DEV__ ? ... : '' (or false); its where is the
 *     same on both builds and holds no sentence and no shown value. A
 *     function that passes one of its parameters into a fail()'s detail, in
 *     whatever form it is written, is a message helper, and every call of it
 *     passes text in that place gated the same way. A floor for new code,
 *     not a proof: a sentence can still reach a message some other way
 *     (a function that returns one), which the next two checks catch.
 *   - the production file, tokenised: no string literal in it has four or
 *     more words in a row, apart from a short allowlist of text that is no
 *     error message (the preview bar's labels, mp4.js's own errors).
 *   - a sample of sentences from different source files is in
 *     dist/kinetic.wf.js and absent from dist/kinetic.wf.min.js.
 *
 * A Node test, run by the gate (scripts/test-extension.cjs) after the browser
 * legs, against the files already built:
 *
 *   node scripts/build-rollup.cjs kinetic.wf
 *   node --test packages/kinetic/test/messages.test.cjs
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PKG = path.resolve(__dirname, '..');
const SRC = path.join(PKG, 'src');
const DEV_FILE = path.join(PKG, 'dist', 'kinetic.wf.js');
const MIN_FILE = path.join(PKG, 'dist', 'kinetic.wf.min.js');
// The acorn that terser uses, fetched with it by scripts/fetch-terser.cjs.
const ACORN = path.join(ROOT, 'tools', 'terser', 'node_modules', 'acorn');
const acorn = require(ACORN);

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js') && f !== 'diagnostics.js').sort();
const sources = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(SRC, f), 'utf8')]));
const trees = Object.fromEntries(files.map((f) => [f, acorn.parse(sources[f], { ecmaVersion: 'latest', sourceType: 'module', locations: true })]));

// Every node under `node`, depth first, with `fn(node)`.
function walk(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const k in node) {
    if (k === 'loc' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) for (const c of v) walk(c, fn);
    else if (v && typeof v.type === 'string') walk(v, fn);
  }
}
const any = (node, test) => { let hit = false; walk(node, (n) => { if (!hit && test(n)) hit = true; }); return hit; };
const isDev = (n) => n && n.type === 'Identifier' && n.name === '__DEV__';
const isText = (n) => (n.type === 'Literal' && typeof n.value === 'string') || n.type === 'TemplateLiteral';
const empty = (n) => n.type === 'Literal' && (n.value === '' || n.value === false);

// A gated argument: __DEV__ && (...), or __DEV__ ? ... : '' or false, so the
// production build has nothing there.
const gated = (n) => (n.type === 'LogicalExpression' && n.operator === '&&' && isDev(n.left))
  || (n.type === 'ConditionalExpression' && isDev(n.test) && empty(n.alternate));

const isFail = (n) => n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'fail';
const text = (f, n) => sources[f].slice(n.start, n.end).replace(/\s+/g, ' ');
const at = (f, n) => f + ':' + n.loc.start.line;

// A where is short: the call with its argument or option, a track's place,
// or the clip, scene, input or query. No literal in it reads as a sentence.
const SENTENCE = /;\s| is | are | not | needs? | has |[A-Za-z]+(?: [A-Za-z]+){3}/;
function whereProblems(f, n) {
  const out = [];
  if (any(n, isDev)) out.push(at(f, n) + ': the where differs by build: ' + text(f, n).slice(0, 70));
  if (any(n, (m) => m.type === 'CallExpression' && ((m.callee.type === 'Identifier' && m.callee.name === 'show')
    || (m.callee.type === 'MemberExpression' && m.callee.object.name === 'JSON')))) out.push(at(f, n) + ': the where shows a value: ' + text(f, n).slice(0, 70));
  if (any(n, (m) => m.type === 'MemberExpression' && !m.computed && m.property.name === 'message')) out.push(at(f, n) + ': the where reads a message: ' + text(f, n).slice(0, 70));
  walk(n, (m) => {
    const s = m.type === 'Literal' && typeof m.value === 'string' ? m.value : m.type === 'TemplateElement' ? m.value.cooked : null;
    if (s !== null && (s.length > 40 || SENTENCE.test(s))) out.push(at(f, m) + ': the where has a sentence: ' + JSON.stringify(s));
  });
  return out;
}

// The message helpers of a file: each function, however written, that passes
// a parameter into the where or the detail of a fail() in its body. Returns
// [{ name, where: Set of parameter indexes, detail: Set of parameter indexes }].
function helpersOf(f) {
  const out = [];
  const consider = (name, fn) => {
    if (!name) return;
    const params = fn.params.map((p) => (p.type === 'Identifier' ? p.name : p.type === 'AssignmentPattern' && p.left.type === 'Identifier' ? p.left.name : null));
    const where = new Set(), detail = new Set();
    walk(fn.body, (n) => {
      if (!isFail(n)) return;
      params.forEach((p, k) => {
        if (!p) return;
        const uses = (arg) => arg && any(arg, (m) => m.type === 'Identifier' && m.name === p);
        if (uses(n.arguments[1])) where.add(k);
        if (uses(n.arguments[2])) detail.add(k);
      });
    });
    if (where.size || detail.size) out.push({ name, where, detail });
  };
  walk(trees[f], (n) => {
    if (n.type === 'FunctionDeclaration') consider(n.id && n.id.name, n);
    else if (n.type === 'VariableDeclarator' && n.init && /Function/.test(n.init.type)) consider(n.id.name, n.init);
    else if (n.type === 'Property' && n.value && /Function/.test(n.value.type)) consider(n.key.name, n.value);
  });
  return out;
}

describe('the source keeps every sentence development-only', () => {
  it('every fail() has a code, a where the same on both builds with no sentence or shown value, and a detail gated by __DEV__', () => {
    const problems = [];
    let count = 0;
    for (const f of files) {
      walk(trees[f], (n) => {
        if (!isFail(n)) return;
        count++;
        const [code, where, detail] = n.arguments;
        if (n.arguments.length !== 3) problems.push(at(f, n) + ': fail() has ' + n.arguments.length + ' arguments, not code, where and detail: ' + text(f, n).slice(0, 70));
        if (!code || !/^(CODES\.\w+|code)$/.test(text(f, code))) problems.push(at(f, n) + ': the first argument is a code, not ' + (code ? text(f, code) : 'nothing'));
        if (where) problems.push(...whereProblems(f, where));
        if (detail && !gated(detail)) problems.push(at(f, n) + ": the detail is not __DEV__ && (...) or __DEV__ ? ... : '': " + text(f, detail).slice(0, 70));
      });
    }
    assert.ok(count > 140, 'found ' + count + ' fail() calls; the scan should see them all');
    assert.deepEqual(problems, []);
  });

  it('every message helper is called with its sentence gated by __DEV__ and its where a where', () => {
    const problems = [];
    const found = [];
    for (const f of files) {
      const helpers = helpersOf(f);
      for (const h of helpers) found.push(f + ' ' + h.name);
      walk(trees[f], (n) => {
        if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier') return;
        for (const h of helpers.filter((x) => x.name === n.callee.name)) {
          n.arguments.forEach((arg, k) => {
            if (h.detail.has(k) && any(arg, isText) && !gated(arg)) problems.push(at(f, n) + ': ' + h.name + '() is given text for a message not gated by __DEV__: ' + text(f, arg).slice(0, 70));
            if (h.where.has(k) && !h.detail.has(k)) problems.push(...whereProblems(f, arg));
          });
        }
      });
    }
    // Helpers the source has today, written in several forms; a new one is
    // found and checked the same way.
    for (const h of ['images.js failed', 'data.js degenerate', 'maps.js why', 'soundtrack.js noDelay', 'motion.js staggerFail', 'text.js bad', 'paths.js bad',
      'motion.js checkShutter', 'motion.js easeAt', 'motion.js seedOf', 'clock.js readShutter', 'effects.js check']) {
      assert.ok(found.includes(h), 'the scan finds ' + h + '; found ' + found.join(', '));
    }
    assert.deepEqual(problems, []);
  });
});

// Sentences from the development build's messages, each a piece of one
// string literal, from ten different source files.
const SENTENCES = [
  ['render.js', 'WebCodecs needs a secure context (https or localhost)'],
  ['render.js', 'turn on HTML-in-Canvas in Chrome'],
  ['motion.js', 'a spring is set by duration and bounce or by stiffness, damping and mass, not both'],
  ['motion.js', 'write transform themselves, so use one or the other'],
  ['clock.js', 'the composition root needs a data-composition-id to register a timeline under'],
  ['scene.js', 'inputs is an object of { type, required, default, validator } by input name'],
  ['scene.js', 'failed its validator, which threw '],
  ['data.js', ' to divide into round steps'],
  ['paths.js', 'paths are matched subpath by subpath, in order, so each needs the same number'],
  ['effects.js', 'so WebGL cannot read it'],
  ['audio.js', 'a page opened from a file cannot fetch its files'],
  ['footage.js', 'Chrome plays H.264, VP9 and AV1 video in an MP4 or WebM file'],
  ['soundtrack.js', 'so the sound could not be lined up with the picture'],
  ['transitions.js', ' masks a clip with a map, so it is for data-clip-transition'],
  ['text.js', "is 'letter' (the default) or 'word'"],
  ['check.js', 'samples is a number of frames, 1 or more'],
  ['maps.js', 'is not an image this browser can decode'],
  ['readiness.js', 'no query by that name exists'],
  ['lottie.js', 'fired data_failed, so part of it could not be loaded'],
  ['images.js', 'animatedImage() reads GIF, WebP and PNG files'],
];

// Text in the production file with four or more words in a row that is no
// error message. Each entry is a piece of one string literal.
const ALLOWED = [
  // mp4.js's own Errors, which have no code: an invariant of the file writer
  // that no page can reach.
  'mp4: avc1 needs the avcC description',
  'mp4: Opus needs the OpusHead description',
  // The preview bar's labels and titles, which production pages show.
  ' (KN-200): serve the page over https or localhost',
  'the production build prints no KN warnings; load the development build to see them',
  'seek 30 frames twice and compare them',
  'sound on; click to turn it off',
  'sound off; click to turn it on',
];

describe('the built files', () => {
  const read = (file) => {
    assert.ok(fs.existsSync(file), path.relative(PKG, file) + ' is missing; build it first: node scripts/build-rollup.cjs kinetic.wf');
    return fs.readFileSync(file, 'utf8');
  };

  it('no string in the production file has four words in a row, apart from the allowlist', () => {
    const min = read(MIN_FILE);
    const words = /[A-Za-z]+(?: [A-Za-z]+){3}/;
    const found = [];
    let strings = 0;
    for (const t of acorn.tokenizer(min, { ecmaVersion: 'latest' })) {
      if (t.type.label !== 'string' && t.type.label !== 'template') continue;
      strings++;
      const s = String(t.value);
      if (words.test(s) && !ALLOWED.some((a) => s.includes(a))) found.push(s.slice(0, 120));
    }
    assert.ok(strings > 500, 'read ' + strings + ' strings from the production file');
    assert.deepEqual(found, []);
  });

  it('the development file has the sentences, and the production file has none of them', () => {
    const dev = read(DEV_FILE), min = read(MIN_FILE);
    assert.ok(new Set(SENTENCES.map(([f]) => f)).size >= 10, 'the sample spans ten source files or more');
    for (const [f, s] of SENTENCES) {
      assert.ok(sources[f].includes(s), f + ' has "' + s + '"; update the sample when a message changes');
      assert.ok(dev.includes(s), 'the development file has "' + s + '" (' + f + ')');
      assert.ok(!min.includes(s), 'the production file has no "' + s + '" (' + f + ')');
    }
  });

  it('the production file keeps every code, has the link once, and drops show(), which only the sentences used', () => {
    const min = read(MIN_FILE), dev = read(DEV_FILE);
    const codes = Array.from(fs.readFileSync(path.join(SRC, 'diagnostics.js'), 'utf8').matchAll(/'(KN-\d+)',\s+\/\/[^\n]*\b(?:thrown|every build)/g), (m) => m[1]);
    // The thrown or printed ones, which every build keeps.
    assert.ok(codes.length >= 10, 'read the codes thrown on every build from diagnostics.js: ' + codes.join(', '));
    for (const code of codes) {
      assert.ok(min.includes('"' + code + '"'), 'the production file has ' + code);
    }
    const link = 'https://www.wildflowerjs.com/docs/error-codes?code=';
    assert.equal(min.split(link).length - 1, 1, 'the production file has the link once');
    assert.equal(dev.split(link).length - 1, 0, 'the development file has no link');
    // show() prints a function as "a function"; nothing in the production build does.
    assert.ok(!/"a "\+typeof/.test(min), 'show() is gone from the production file');
  });
});
