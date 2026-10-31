/**
 * Error messages by build. Every build throws or rejects with the same KN
 * error from the same call, with its `code`, and its message starts with the
 * code and where: the call with the argument or option that failed, or the
 * clip, scene, input or file a failure of the page is about. One exception
 * to "the same": the development build's KN-138 waits for a fetch that finds
 * the cause, so with two failures on one page ready() can reject with a
 * different first code on each build. The production build ends with a
 * link to the code's entry on the error-codes page; the development build
 * goes on with the sentence that explains it, which is also on that page,
 * and has no link. This file runs once per build and checks each
 * way an error arrives: thrown by a call, rejected by render() and by
 * ready(), made again from an inner error (an ease inside an ease array),
 * printed once by readiness, and printed by the preview bar. render()'s
 * KN-201, KN-204 and KN-206 are in the render suite (render.test.js and
 * runtime.test.js).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, framedPage, uniqueName, expectKN, DOCS, FOOTAGE, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  wf.kinetic.config({ preview: false });
  for (const el of cleanup.splice(0)) el.remove();
});

describe(`an error thrown by a call (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('KN-100: seek() with a time that is no number', async () => {
    const { wf } = await load();
    expectKN(() => wf.kinetic.seek('x'), 'KN-100', 'seek(time)', 'time is a number of seconds, not "x"');
  });

  it("KN-120: a scene's track whose at is not numbers, with the track's label and the keyframe", async () => {
    const { wf } = await load();
    const name = uniqueName('track');
    expectKN(() => wf.kinetic.scene(name, { keyframes: { look: { opacity: { at: [0, 'a'], to: [0, 1] } } } }),
      'KN-120', "scene('" + name + "').keyframes.look.opacity.at[1]", 'at[1] is not a number');
    // The same track read by styleAt() names the key in styleAt()'s tracks, and one track alone interpolate(t, track).
    expectKN(() => wf.kinetic.styleAt(0.5, { opacity: { at: [0, 'a'], to: [0, 1] } }), 'KN-120', 'styleAt(t, tracks).opacity.at[1]', 'at[1] is not a number');
    expectKN(() => wf.kinetic.interpolate(0.5, { at: [0, 1], to: [0, 1], round: 'yes' }), 'KN-120', 'interpolate(t, track).round', /^round is /);
  });

  it('KN-121: an ease with no such name', async () => {
    const { wf } = await load();
    expectKN(() => wf.kinetic.ease('zoom'), 'KN-121', 'ease(name)', /^'zoom' is not an ease\. The eases are linear, smooth, spring, the CSS names ease, ease-in, ease-out, and ease-in-out, steps\(n\), cubic-bezier\(x1, y1, x2, y2\) with x1 and x2 from 0 to 1, and power1 to power4, sine, expo, circ, back, elastic, and bounce, each alone \(the \.out form\) or with \.in, \.out, or \.inOut$/);
  });

  it("KN-121: the closest ease for the names other tools use, and for a near miss", async () => {
    const { wf } = await load();
    const near = {
      easeInOut: 'power2.inOut', 'Easing.inOut': 'power2.inOut', 'Easing.inOut(Easing.cubic)': 'power2.inOut', easeOutCubic: 'power2.out',
      easeInQuad: 'power1.in', easeInOutQuart: 'power3.inOut', easeOutQuint: 'power4.out', easeInSine: 'sine.in', easeOutExpo: 'expo.out',
      easeInOutBack: 'back.inOut', easeOutElastic: 'elastic.out', easeOutBounce: 'bounce.out', 'Power2.easeOut': 'power2.out', 'power3.inout': 'power3.inOut',
      'Linear.easeNone': 'linear', none: 'linear', ease_in_out: 'ease-in-out', 'EASE-OUT': 'ease-out', 'Easing.bezier(0.3, 0, 0.2, 1)': 'cubic-bezier(x1, y1, x2, y2)',
      'step(4)': 'steps(n)', quad: 'power1', lineer: 'linear', springy: 'spring', smoth: 'smooth', 'power2.ot': 'power2.out',
    };
    for (const [name, want] of Object.entries(near)) {
      expectKN(() => wf.kinetic.ease(name), 'KN-121', 'ease(name)', "'" + name + "' is not an ease; did you mean '" + want + "'? The eases are linear,");
    }
  });

  it('KN-100 for a BigInt, which the development sentence prints rather than throwing a TypeError of its own', async () => {
    const { wf } = await load();
    expectKN(() => wf.kinetic.seek(1n), 'KN-100', 'seek(time)', 'time is a number of seconds, not 1n');
    expectKN(() => wf.kinetic.config({ fps: 1n }), 'KN-100', 'config({ fps })', 'fps is a finite number above 0, not 1n');
    expectKN(() => wf.kinetic.config({ channel: 1n }), 'KN-100', 'config({ channel })', /not 1n$/);
  });
});

// Two different mistakes in one call give two different production messages:
// the where names the argument or option, or the thing on the page, that
// failed. Each call here is a different mistake.
describe(`one where per mistake (${BUILD} extension, ${CORE_TIER} core)`, () => {
  const caught = (fn) => { try { fn(); } catch (e) { return e; } return null; };
  function expectDistinct(errors, code) {
    for (const e of errors) expect(e && e.code, String(e && e.message)).toBe(code);
    const messages = errors.map((e) => e.message);
    expect(new Set(messages).size, messages.join('\n')).toBe(messages.length);
  }

  it('shake()', async () => {
    const { wf } = await load();
    const { shake } = wf.kinetic;
    expectDistinct([
      caught(() => shake(0, 'walk')),
      caught(() => shake(NaN, 'impact')),
      caught(() => shake(0, 'rumble', { amount: -1 })),
      caught(() => shake(0, 'rumble', { speed: 0 })),
      caught(() => shake(0, 'rumble', { seed: null })),
    ], 'KN-100');
  });

  it('stagger()', async () => {
    const { wf } = await load();
    const { stagger } = wf.kinetic;
    expectDistinct([
      caught(() => stagger(0, 0)),
      caught(() => stagger(3, 3)),
      caught(() => stagger(0, 3, { from: 'middle' })),
      caught(() => stagger(0, 3, { each: -1 })),
      caught(() => stagger(0, 3, { total: -1 })),
      caught(() => stagger(0, 3, { grid: [1, 1] })),
      caught(() => stagger(0, 3, { axis: 'x' })),
      caught(() => stagger(0, 3, { grid: [3, 1], axis: 'z' })),
      caught(() => stagger(0, 3, { from: 'random', seed: null })),
    ], 'KN-100');
    expectKN(() => stagger(0, 3, { ease: 'nope' }), 'KN-121', 'stagger(i, n, { ease })', "'nope' is not an ease");
  });

  it('sweep()', async () => {
    const { wf } = await load();
    const { sweep } = wf.kinetic;
    expectDistinct([
      caught(() => sweep(0, 0, 0)),
      caught(() => sweep(3, 3, 0)),
      caught(() => sweep(0, 3, NaN)),
      caught(() => sweep(0, 3, 0, { from: 'middle' })),
      caught(() => sweep(0, 3, 0, { width: 0 })),
      caught(() => sweep(0, 3, 0, { shape: 'saw' })),
      caught(() => sweep(0, 3, 0, { from: 'random', seed: null })),
    ], 'KN-100');
    expectKN(() => sweep(0, 3, 0, { ease: 'nope' }), 'KN-121', 'sweep(i, n, p, { ease })', "'nope' is not an ease");
  });

  it('repeat()', async () => {
    const { wf } = await load();
    const { repeat } = wf.kinetic;
    expectDistinct([
      caught(() => repeat(0)),
      caught(() => repeat(2, 5)),
      caught(() => repeat(2, { skew: 1 })),
      caught(() => repeat(2, { translateX: 'a' })),
      caught(() => repeat(2, { translateY: NaN })),
      caught(() => repeat(2, { rotate: Infinity })),
      caught(() => repeat(2, { scale: 0 })),
      caught(() => repeat(2, { offset: 1.5 })),
      caught(() => repeat(2, { opacity: [2, 0] })),
      caught(() => repeat(2, { origin: 5 })),
    ], 'KN-100');
  });

  it('render(): the source with no size, a codec the browser cannot encode at the size, and two bad options', async ({ skip }) => {
    const { wf } = await load();
    if (typeof window.VideoEncoder !== 'function') skip();
    const host = await mount('<div data-composition-id="ms4" data-start="0" data-duration="1"></div>');
    cleanup.push(host);
    const empty = document.createElement('canvas');
    empty.width = 0; empty.height = 0;
    const errors = [await wf.kinetic.render({ download: false, source: empty }).then(() => null, (e) => e)];
    const check = VideoEncoder.isConfigSupported;
    VideoEncoder.isConfigSupported = async () => ({ supported: false });
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 36;
      errors.push(await wf.kinetic.render({ download: false, source: canvas }).then(() => null, (e) => e));
    } finally {
      VideoEncoder.isConfigSupported = check;
    }
    errors.push(await wf.kinetic.render({ download: false, bitrate: -1 }).then(() => null, (e) => e));
    errors.push(await wf.kinetic.render({ download: false, audioBitrate: -1 }).then(() => null, (e) => e));
    expectDistinct(errors, 'KN-100');
    expectKN(errors[0], 'KN-100', 'render({ width, height })', /^the source has no size/);
    expectKN(errors[1], 'KN-100', 'render(): avc1.640028 at 64x36', /^this browser cannot encode avc1\.640028 at 64x36/);
  });
});

describe(`the link to the code's entry (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("the production message ends with the error-codes page's link for its own code; the development message has none", async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const caught = (fn) => { try { fn(); } catch (e) { return e; } return null; };
    const errors = [
      caught(() => k.seek('x')),
      caught(() => k.interpolate(0.5, [0, 'a'], [0, 1])),
      caught(() => k.ease('zoom')),
      caught(() => k.transition('nope', 0.5)),
      caught(() => k.random(null)),
    ];
    expect(errors.map((e) => e && e.code)).toEqual(['KN-100', 'KN-120', 'KN-121', 'KN-100', 'KN-100']);
    for (const err of errors) {
      const link = / (\S+)$/.exec(err.message);
      if (BUILD === 'min') {
        expect(link && link[1].startsWith(DOCS), err.message).toBe(true);
        const url = new URL(link[1]);
        expect([url.origin + url.pathname, url.searchParams.get('code')]).toEqual(['https://www.wildflowerjs.com/docs/error-codes', err.code]);
      } else {
        expect(err.message).not.toContain('https://');
      }
    }
  });
});

describe(`an error made from an inner one (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("KN-121: an entry of an ease array gives its index, and the development build the entry's own sentence", async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    expectKN(() => k.interpolate(0.5, [0, 1, 2], [0, 1, 0], { ease: ['linear', 'zoom'] }), 'KN-121', 'interpolate.ease[1]', /^'zoom' is not an ease\. The eases are /);
    expectKN(() => k.interpolate(0.5, [0, 1, 2], [0, 1, 0], { ease: ['linear', 4] }), 'KN-121', 'interpolate.ease[1]', /^a name, a function or \{ spring: \{\.\.\.\} \}, not 4$/);
    const name = uniqueName('rewrap');
    expectKN(() => k.scene(name, { keyframes: { look: { opacity: { at: [0, 1, 2], to: [0, 1, 0], ease: ['spring', { spring: { mass: 0 } }] } } } }),
      'KN-121', "scene('" + name + "').keyframes.look.opacity.ease[1].spring.mass", /^stiffness and mass are finite numbers above 0/);
    // A single ease names the track's .ease, and a wrong number of eases the same.
    expectKN(() => k.interpolate(0.5, [0, 1], [0, 1], { ease: 'zoom' }), 'KN-121', 'interpolate.ease', "'zoom' is not an ease");
    expectKN(() => k.interpolate(0.5, [0, 1, 2], [0, 1, 0], { ease: ['linear'] }), 'KN-121', 'interpolate.ease', /^ease is one ease per segment/);
    // The same ease on its own, or in ramp() or stagger(), names that call.
    expectKN(() => k.ease({ spring: { mass: 0 } }), 'KN-121', 'ease(name).spring.mass', /^stiffness and mass are finite numbers above 0/);
    expectKN(() => k.ease({ spring: { duration: 1, stiffness: 50 } }), 'KN-121', 'ease(name).spring', /^a spring is set by duration and bounce/);
    expectKN(() => k.ramp(0.5, 0, 1, 'zoom'), 'KN-121', 'ramp(t, from, to, ease)', "'zoom' is not an ease");
    expectKN(() => k.stagger(0, 3, { ease: { spring: { duration: -1 } } }), 'KN-121', 'stagger(i, n, { ease }).spring.duration', /^duration is a finite number/);
    // spring() and settle() name their option.
    expectKN(() => k.spring(1, { damping: -1 }), 'KN-100', 'spring(t, { damping })', /^stiffness and mass are finite numbers above 0, damping/);
    expectKN(() => k.settle({ duration: 1, bounce: 2 }), 'KN-100', 'settle({ bounce })', /^duration is a finite number/);
    expectKN(() => k.settle({ duration: 1, mass: 2 }), 'KN-100', 'settle(opts)', /^a spring is set by duration and bounce/);
  });
});

describe(`an error render() rejects with (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('KN-100: render({ audioBitrate }) with a bitrate below 0, before the page is touched', async ({ skip }) => {
    const { wf } = await load();
    if (typeof window.VideoEncoder !== 'function') skip();
    const host = await mount('<div data-composition-id="ms1" data-start="0" data-duration="1" data-width="64" data-height="36"></div>');
    cleanup.push(host);
    await expectKN(wf.kinetic.render({ audioBitrate: -1, download: false }), 'KN-100', 'render({ audioBitrate })', 'audioBitrate is bits per second, a number above 0 such as 192000, not -1');
    expect(document.querySelector('[data-kinetic-render]')).toBeNull();
  });

  it('KN-200: render() with no VideoEncoder', async () => {
    const { wf } = await load();
    const host = await mount('<div data-composition-id="ms2" data-start="0" data-duration="1" data-width="64" data-height="36"></div>');
    cleanup.push(host);
    const had = 'VideoEncoder' in window;
    const saved = window.VideoEncoder;
    delete window.VideoEncoder;
    try {
      await expectKN(wf.kinetic.render({ download: false }), 'KN-200', 'render()', /^this page has no VideoEncoder; WebCodecs needs a secure context/);
    } finally {
      if (had) window.VideoEncoder = saved;
    }
  });
});

describe(`the preview bar's printed failure (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('the bar prints the error message once, as the build words it, and shows the code', async () => {
    const { wf } = await load();
    const host = await mount('<div data-composition-id="ms3" data-start="0" data-duration="1" data-fps="10" data-width="64" data-height="36"></div>');
    cleanup.push(host);
    wf.kinetic.config({ preview: true });
    await tick(10);
    const bar = document.querySelector('[data-kinetic-preview]');
    const had = 'VideoEncoder' in window;
    const saved = window.VideoEncoder;
    delete window.VideoEncoder;
    const errors = [];
    const orig = console.error;
    console.error = (...a) => { errors.push(a.map(String).join(' ')); };
    try {
      bar.querySelector('[data-action="render"]').click();
      await tick(30);
    } finally {
      console.error = orig;
      if (had) window.VideoEncoder = saved;
    }
    const ours = errors.filter((l) => l.startsWith('[KN-'));
    expect(ours.length, ours.join('\n')).toBe(1);
    expectKN({ code: 'KN-200', message: ours[0] }, 'KN-200', 'render()', /^this page has no VideoEncoder/);
    expect(bar.querySelector('span').textContent).toBe('render failed (KN-200): serve the page over https or localhost');
  });
});

describe(`an error ready() rejects with, printed once (${BUILD} extension, ${CORE_TIER} core)`, () => {
  // ready() rejected with `code` and `where`, and the same message printed
  // once with console.error, so a production page prints the short form.
  async function expectFailure(p, code, where, detail) {
    const { w, result } = p;
    expectKN(result, code, where, detail);
    expect(w.__errors.filter((l) => l.startsWith('[KN-'))).toEqual([result.message]);
    expect(w.document.querySelector('[data-composition-id]').getAttribute('data-kinetic-ready')).toBe('failed');
  }
  const page = (inner) => framedPage(`<div data-composition-id="mr" data-start="0" data-duration="2" data-fps="30" data-width="160" data-height="90">${inner}</div>`, cleanup);

  it("KN-130: a required input the composition has no variable for, with the scene and the input", async () => {
    // With `head` given, framedPage loads the framework and Kinetic in
    // <head>, so the script in the body defines the scene as a page does.
    const p = await framedPage('<div data-composition-id="mr" data-start="0" data-duration="2"><div data-component="card"><b data-bind="inputs.title"></b></div></div>'
      + '<script>wildflower.kinetic.scene("card", { inputs: { title: { type: String, required: true } } });<\/script>', cleanup, '', '');
    await expectFailure(p, 'KN-130', "scene 'card' input 'title'", "is required and the composition has no variable 'title'");
  });

  it('KN-135: an audio clip whose file is not there, with the clip and its file', async () => {
    const src = '/packages/kinetic/test/no-such-file.wav';
    await expectFailure(await page(`<audio id="music" src="${src}" data-start="0"></audio>`), 'KN-135', 'the audio clip audio#music (' + src + ')', 'could not be loaded (HTTP 404)');
  });

  it('KN-138: a footage clip whose file is not there, with the clip and its file', async () => {
    const src = FOOTAGE + 'no-such-file.webm';
    await expectFailure(await page(`<video id="gone" src="${src}" data-start="0" muted></video>`), 'KN-138', 'the footage clip video#gone (' + src + ')', 'could not be loaded (HTTP 404)');
  });

  it("KN-117: a luma transition's map that is not there, with the map, the clip and the attribute", async () => {
    const src = '/packages/kinetic/test/fixtures/no-such-map.png';
    await expectFailure(await page(`<div id="gone" data-start="0" data-duration="2" data-clip-enter="luma url(${src}) 0.5"></div>`),
      'KN-117', 'the map url(' + src + ") of div#gone's data-clip-enter", 'could not be loaded (HTTP 404)');
  });
});
