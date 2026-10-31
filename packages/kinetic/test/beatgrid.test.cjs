/**
 * scripts/beatgrid.cjs on music whose answers are known: tracks synthesised
 * here and written as WAV (which the script reads without ffmpeg), each with
 * a tempo, a meter, a first downbeat and a section where the kick and bass
 * come in. The script's tempo, meter, downbeat and section changes are
 * checked against them.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { analyseFile } = require('../scripts/beatgrid.cjs');

const SR = 22050;
const SCRIPT = path.join(__dirname, '..', 'scripts', 'beatgrid.cjs');

// A mono 16-bit WAV of `seconds`, from `voice(t)` at each sample.
function wav(file, seconds, voice) {
  const n = Math.round(seconds * SR), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, voice(i / SR))) * 32000), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

// A stereo 24-bit WAV in the extensible format (tag 0xFFFE, the PCM
// subformat GUID), as many recorders and DAWs write one.
function wavExtensible(file, seconds, voice) {
  const n = Math.round(seconds * SR), buf = Buffer.alloc(68 + n * 6);
  buf.write('RIFF', 0); buf.writeUInt32LE(60 + n * 6, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(40, 16);
  buf.writeUInt16LE(0xFFFE, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 6, 28);
  buf.writeUInt16LE(6, 32); buf.writeUInt16LE(24, 34); buf.writeUInt16LE(22, 36); buf.writeUInt16LE(24, 38); buf.writeUInt32LE(3, 40);
  Buffer.from('0100000000001000800000aa00389b71', 'hex').copy(buf, 44);
  buf.write('data', 60); buf.writeUInt32LE(n * 6, 64);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.max(-1, Math.min(1, voice(i / SR))) * 8000000);
    buf.writeIntLE(v, 68 + i * 6, 3); buf.writeIntLE(v, 71 + i * 6, 3);
  }
  fs.writeFileSync(file, buf);
}

// A deterministic noise in -1..1.
const noise = (i) => { const x = Math.sin(i * 12.9898) * 43758.5453; return 2 * (x - Math.floor(x)) - 1; };

// A track: `meter` beats to a bar at `bpm`, the first downbeat at `first`
// seconds; before bar `drop`, hats and a pad only; from it, a kick on each
// bar's first beat (and, in 4, a softer one on the third), a snare on the
// others, and a bass note that changes on every bar line.
function track({ bpm, meter, first, bars, drop }) {
  const beat = 60 / bpm, bar = beat * meter, seconds = first + bars * bar + 0.5;
  const NOTES = [55, 65.4, 49, 73.4, 58.3, 41.2];
  return (t) => {
    let s = 0;
    const rel = t - first;
    if (rel < 0) return 0.02 * noise(Math.round(t * SR));
    const b = Math.floor(rel / bar), inBar = rel - b * bar, k = Math.floor(inBar / beat), u = inBar - k * beat;
    // Hats on every half beat, and a pad that changes chord each bar.
    const h = (inBar % (beat / 2));
    s += 0.12 * Math.exp(-h * 60) * noise(Math.round(t * SR));
    s += 0.06 * Math.sin(2 * Math.PI * (220 + 30 * (b % 4)) * t);
    if (b >= drop) {
      const kick = k === 0 ? 1 : meter === 4 && k === 2 ? 0.55 : 0;
      if (kick) s += kick * 0.8 * Math.exp(-u * 18) * Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-u * 30)) * u);
      if (k > 0 && !(meter === 4 && k === 2)) s += 0.35 * Math.exp(-u * 25) * noise(Math.round(t * SR) * 3);
      s += 0.25 * Math.sin(2 * Math.PI * NOTES[b % NOTES.length] * t);
    }
    return s * 0.8;
  };
}

function check(name, spec) {
  test(name, () => {
    const file = path.join(os.tmpdir(), 'beatgrid-' + process.pid + '-' + spec.meter + '.wav');
    const beat = 60 / spec.bpm, bar = beat * spec.meter;
    wav(file, spec.first + spec.bars * bar + 0.5, track(spec));
    try {
      const r = analyseFile(file);
      // A fast track may be read at half time, with a double-time reading
      // offered beside it: then that reading is the one checked.
      const g = spec.halfTime && Math.abs(r.bpm - spec.bpm / 2) <= 0.05 ? r.doubleTime : r;
      assert.ok(g && Math.abs(g.bpm - spec.bpm) <= 0.05, 'tempo, made at ' + spec.bpm + ', in ' + JSON.stringify(r));
      assert.strictEqual(g.meter, spec.meter, 'meter, in ' + JSON.stringify(r));
      // The first downbeat, to within 15 ms.
      assert.ok(Math.abs(g.downbeat - spec.first) <= 0.015, 'downbeat, made at ' + spec.first + ', in ' + JSON.stringify(r));
      // The drop, found at its bar line.
      const dropAt = spec.first + spec.drop * bar;
      const rise = r.sections.find((s) => s.low > 0 || s.change > 0);
      assert.ok(rise && Math.abs(rise.time - dropAt) <= 0.03, 'the drop at ' + dropAt.toFixed(3) + ', found ' + JSON.stringify(r.sections));
      assert.strictEqual(Object.values(r.markers)[0], rise.time);
      // The one drop is one section change, not one per bar it passes on.
      assert.strictEqual(r.sections.length, 1, 'one section change, found ' + JSON.stringify(r.sections));
      // The synthesised track has a steady pulse: no call on it is low.
      for (const c of ['tempoConfidence', 'meterConfidence', 'downbeatConfidence']) assert.notStrictEqual(r[c], 'low', c + ', in ' + JSON.stringify(r));
      // Counted in double time, a bar of 3 is a bar of 6, from the same downbeat.
      if (spec.meter === 3) {
        assert.ok(r.doubleTime, 'a double-time reading, in ' + JSON.stringify(r));
        assert.strictEqual(r.doubleTime.meter, 6, 'the double-time meter, in ' + JSON.stringify(r));
        assert.strictEqual(r.doubleTime.downbeat, r.downbeat);
      }
    } finally {
      fs.unlinkSync(file);
    }
  });
}

check('4/4 at 128 BPM, the first downbeat at 0.6 s, the kick and bass in at bar 8', { bpm: 128, meter: 4, first: 0.6, bars: 24, drop: 8 });
check('3/4 at 96 BPM, the first downbeat at 0.35 s, the kick and bass in at bar 8', { bpm: 96, meter: 3, first: 0.35, bars: 24, drop: 8 });
check('4/4 at 174 BPM (fast), read as 174 or as 87 with 174 offered, the first downbeat at 0.2 s, the kick and bass in at bar 16', { bpm: 174, meter: 4, first: 0.2, bars: 40, drop: 16, halfTime: true });

test('a file that is not audio, and one under 8 s, fail with a message', () => {
  const short = path.join(os.tmpdir(), 'beatgrid-short-' + process.pid + '.wav');
  wav(short, 3, () => 0);
  try {
    assert.throws(() => analyseFile(short), /under 8 s/);
  } finally {
    fs.unlinkSync(short);
  }
});

// A file written by `write(file)` in the temporary folder, handed to `fn`.
function withFile(name, write, fn) {
  const file = path.join(os.tmpdir(), 'beatgrid-' + process.pid + '-' + name);
  write(file);
  try { return fn(file); } finally { fs.unlinkSync(file); }
}

test('white noise and a pure sine have no pulse: the tempo and the meter are low', () => {
  for (const [name, voice] of [['white', (t) => 0.5 * noise(Math.round(t * SR))], ['sine', (t) => 0.5 * Math.sin(2 * Math.PI * 440 * t)]]) {
    withFile(name + '.wav', (f) => wav(f, 20, voice), (f) => {
      const r = analyseFile(f);
      assert.strictEqual(r.tempoConfidence, 'low', name + ', in ' + JSON.stringify(r));
      assert.strictEqual(r.meterConfidence, 'low', name + ', in ' + JSON.stringify(r));
    });
  }
});

test('a 9 s clip is too few bars for a sure meter', () => {
  withFile('nine.wav', (f) => wav(f, 9, track({ bpm: 128, meter: 4, first: 0.6, bars: 4, drop: 2 })), (f) => {
    const r = analyseFile(f);
    assert.notStrictEqual(r.meterConfidence, 'high', JSON.stringify(r));
  });
});

test('digital silence throws: there are no onsets to find a grid in', () => {
  withFile('silence.wav', (f) => wav(f, 20, () => 0), (f) => {
    assert.throws(() => analyseFile(f), /no onsets/);
  });
});

test('a slow track with hats on the half beats is read at its tempo, or at double with a half-time reading', () => {
  const spec = { bpm: 70, meter: 4, first: 0.5, bars: 16, drop: 4 };
  withFile('slow.wav', (f) => wav(f, spec.first + spec.bars * 4 * 60 / 70 + 0.5, track(spec)), (f) => {
    const r = analyseFile(f);
    const g = Math.abs(r.bpm - 70) <= 0.05 ? r : r.halfTime;
    assert.ok(g && Math.abs(g.bpm - 70) <= 0.05, JSON.stringify(r));
    assert.strictEqual(g.meter, 4, JSON.stringify(r));
    assert.ok(Math.abs(g.downbeat - spec.first) <= 0.015, JSON.stringify(r));
  });
});

test('an extensible-format 24-bit WAV is read without ffmpeg', () => {
  const spec = { bpm: 128, meter: 4, first: 0.6, bars: 24, drop: 8 };
  withFile('ext.wav', (f) => wavExtensible(f, spec.first + spec.bars * 4 * 60 / 128 + 0.5, track(spec)), (f) => {
    const PATH = process.env.PATH;
    process.env.PATH = '';
    try {
      const r = analyseFile(f);
      assert.ok(Math.abs(r.bpm - 128) <= 0.05, JSON.stringify(r));
    } finally {
      process.env.PATH = PATH;
    }
  });
});

test('a WAV whose data chunk declares size 0 is read to the end of the file', () => {
  const spec = { bpm: 128, meter: 4, first: 0.6, bars: 24, drop: 8 };
  withFile('size0.wav', (f) => {
    wav(f, spec.first + spec.bars * 4 * 60 / 128 + 0.5, track(spec));
    const b = fs.readFileSync(f); b.writeUInt32LE(0, 40); fs.writeFileSync(f, b);
  }, (f) => {
    const r = analyseFile(f);
    assert.ok(Math.abs(r.bpm - 128) <= 0.05, JSON.stringify(r));
  });
});

test('a WAV header with no channels is not a readable WAV', () => {
  withFile('chan0.wav', (f) => {
    wav(f, 10, () => 0);
    const b = fs.readFileSync(f); b.writeUInt16LE(0, 22); fs.writeFileSync(f, b);
  }, (f) => {
    assert.throws(() => analyseFile(f), /not a readable WAV/);
  });
});

test('-- ends the options, so a file whose name starts with -- can be named', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatgrid-dash-'));
  try {
    wav(path.join(dir, '--track.wav'), 20, track({ bpm: 128, meter: 4, first: 0.6, bars: 8, drop: 2 }));
    const r = spawnSync(process.execPath, [SCRIPT, '--json', '--', '--track.wav'], { cwd: dir, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.strictEqual(JSON.parse(r.stdout).file, '--track.wav');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
