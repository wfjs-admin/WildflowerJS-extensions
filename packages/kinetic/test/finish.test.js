/**
 * The finishing pass's option, the part that needs no encoder: config({
 * finish }) and render({ finish }) read the same fields (finish.js), a
 * number for a field's amount or an object of its parts, each part checked
 * (KN-100 naming the field and the part), off at 0, false or null, a field
 * at 0 or a grade of defaults dropped, and the fields read back from
 * config(). The pass on rendered frames is in render.test.js, which needs
 * the installed Chrome.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, uniqueName, expectKN, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.config({ finish: null });
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

describe(`finish (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('config({ finish }): a number is a field\'s amount, an object its parts with the defaults filled, 0 and null are off, and config() reads it back', async () => {
    const { wf } = await load();
    expect(wf.kinetic.config().finish).toBe(false);
    wf.kinetic.config({ finish: { grain: 0.3, vignette: { amount: 0.4, radius: 0.3 }, bloom: 0.5, aberration: 0.2, soften: 0.1, dust: { amount: 0.5, size: 2 }, grade: { lift: 0.05, saturation: 0.7 } } });
    // Read back as named parts, the form config({ finish }) takes.
    const set = {
      grain: { amount: 0.3, size: 1, fps: 0 }, vignette: { amount: 0.4, radius: 0.3, softness: 0.6 }, bloom: { amount: 0.5, threshold: 0.8, radius: 24 },
      aberration: { amount: 0.2 }, soften: { amount: 0.1 }, dust: { amount: 0.5, size: 2 },
      grade: { exposure: 0, contrast: 1, saturation: 0.7, temperature: 0, lift: 0.05, gamma: 1, gain: 1 },
    };
    expect(wf.kinetic.config().finish).toEqual(set);
    // A copy: the caller's object and the one read back are not the setting.
    const back = wf.kinetic.config().finish;
    back.grain.amount = 1;
    expect(wf.kinetic.config().finish.grain).toEqual({ amount: 0.3, size: 1, fps: 0 });
    // What config() reports, config() takes back: a setting saved and put back.
    const saved = wf.kinetic.config();
    wf.kinetic.config({ finish: null });
    wf.kinetic.config({ finish: saved.finish });
    expect(wf.kinetic.config().finish).toEqual(set);
    // A field at 0, false or null, or a grade of defaults, is off, and all
    // off is false.
    wf.kinetic.config({ finish: { grain: 0, vignette: false, dust: null, grade: { contrast: 1, gamma: 1 } } });
    expect(wf.kinetic.config().finish).toBe(false);
    for (const off of [0, false, null]) {
      wf.kinetic.config({ finish: { grain: 0.2 } });
      wf.kinetic.config({ finish: off });
      expect(wf.kinetic.config().finish, String(off)).toBe(false);
    }
    // Unchanged by a config call that does not name it.
    wf.kinetic.config({ finish: { vignette: 1 } });
    wf.kinetic.config({ loop: true });
    expect(wf.kinetic.config().finish).toEqual({ vignette: { amount: 1, radius: 0.5, softness: 0.6 } });
  });

  it('config({ finish }): KN-100 names the field and the part that failed, and leaves the setting as it was', async () => {
    const { wf } = await load();
    wf.kinetic.config({ finish: { grain: 0.25 } });
    const bad = [
      [[1, 2], 'config({ finish })', /an object of fields \(grain, vignette, bloom, aberration, soften, dust, grade\)/],
      ['film', 'config({ finish })', /film/],
      [{ glow: 1 }, 'config({ finish: { glow } })', /'glow' is not a field of finish; the fields are grain/],
      [{ grain: 'a lot' }, 'config({ finish: { grain } })', /grain is a number, its amount, or an object of amount, size, fps, not/],
      [{ grain: { amount: 0.2, fps: -1 } }, 'config({ finish: { grain: { fps } } })', /fps is a number from 0 to 240, not -1/],
      [{ grain: 2 }, 'config({ finish: { grain: { amount } } })', /amount is a number from 0 to 1, not 2/],
      [{ grain: { size: 0.5 } }, 'config({ finish: { grain: { size } } })', /size is a number from 1 to 8, not 0.5/],
      [{ vignette: { feather: 1 } }, 'config({ finish: { vignette: { feather } } })', /'feather' is not a part of vignette; the parts are amount, radius, softness/],
      [{ bloom: { radius: 500 } }, 'config({ finish: { bloom: { radius } } })', /radius is a number from 1 to 200/],
      [{ grade: 0.5 }, 'config({ finish: { grade } })', /grade is an object of exposure, contrast, saturation, temperature, lift, gamma, gain, not 0.5/],
      [{ grade: { gamma: 0 } }, 'config({ finish: { grade: { gamma } } })', /gamma is a number from 0.2 to 5, not 0/],
      [{ dust: { amount: -1 } }, 'config({ finish: { dust: { amount } } })', /amount is a number from 0 to 1, not -1/],
      [{ aberration: NaN }, 'config({ finish: { aberration: { amount } } })', /amount is a number from 0 to 8/],
      [{ soften: 17 }, 'config({ finish: { soften: { amount } } })', /amount is a number from 0 to 16, not 17/],
    ];
    for (const [finish, where, detail] of bad) {
      let err = null;
      try { wf.kinetic.config({ finish }); } catch (e) { err = e; }
      expectKN(err, 'KN-100', where, detail);
    }
    expect(wf.kinetic.config().finish).toEqual({ grain: { amount: 0.25, size: 1, fps: 0 } });
  });

  it('the live finish: overlays in the root from config({ finish }), the grain moved at its fps and the dust drawn on every seek, the grain still by default, gone when it is off', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="${uniqueName('lf')}" data-start="0" data-duration="2" data-width="320" data-height="180" data-fps="10" style="width:320px;height:180px"><div data-component="${name}"><div style="width:320px;height:180px;background:#444"></div></div></div>`);
    cleanup.push(host);
    const root = host.querySelector('[data-composition-id]');
    const over = () => Array.from(root.querySelectorAll('[data-kinetic-finish]'));
    expect(over().length).toBe(0);
    wf.kinetic.config({ finish: { vignette: { amount: 0.4, radius: 0.3, softness: 0.5 }, grain: { amount: 0.5, fps: 10 }, dust: 1, grade: { exposure: -1, saturation: 0.5 }, soften: 1 } });
    // The backdrop first, then the vignette, the grain and the dust, each
    // absolute over the root and under the pointer; the static root is
    // placed so they cover it.
    expect(over().length).toBe(4);
    for (const e of over()) {
      expect(getComputedStyle(e).pointerEvents).toBe('none');
      expect(getComputedStyle(e).position).toBe('absolute');
      expect(e.parentNode).toBe(root);
    }
    expect(getComputedStyle(root).position).toBe('relative');
    const [back, vig, grn, dst] = over();
    expect(back.style.backdropFilter).toBe('brightness(0.5) contrast(1) saturate(0.5) blur(0.75px)');
    expect(vig.style.background).toContain('radial-gradient');
    expect(vig.style.background).toContain('30%');
    expect(vig.style.background).toContain('80%');
    expect(grn.style.mixBlendMode).toBe('overlay');
    expect(grn.style.opacity).toBe('0.3');
    expect(grn.style.backgroundImage).toContain('data:image/png');
    expect(dst.localName).toBe('canvas');
    // A seek moves the grain and draws the dust for its frame; another seek
    // gives another frame's.
    const specks = () => { const d = dst.getContext('2d').getImageData(0, 0, dst.width, dst.height).data; const on = []; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) on.push(i); return on; };
    await wf.kinetic.seek(0.5);
    await tick(); await tick();
    const pos1 = grn.style.backgroundPosition, dust1 = specks();
    expect(pos1).toMatch(/^\d+px \d+px$/);
    expect(dust1.length).toBeGreaterThan(0);
    await wf.kinetic.seek(1);
    await tick(); await tick();
    expect(grn.style.backgroundPosition).not.toBe(pos1);
    expect(specks().join(',')).not.toBe(dust1.join(','));
    // The same seek again draws the same dust.
    await wf.kinetic.seek(0.5);
    await tick(); await tick();
    expect(specks().join(',')).toBe(dust1.join(','));
    expect(grn.style.backgroundPosition).toBe(pos1);
    // With no fps the grain holds still from seek to seek.
    wf.kinetic.config({ finish: { grain: 0.5 } });
    const still = over()[0];
    await wf.kinetic.seek(0.5);
    await tick(); await tick();
    const pos2 = still.style.backgroundPosition;
    await wf.kinetic.seek(1);
    await tick(); await tick();
    expect(still.style.backgroundPosition).toBe(pos2);
    // One field makes one overlay; off takes them all away and gives the
    // root its own position back.
    wf.kinetic.config({ finish: { vignette: 1 } });
    expect(over().length).toBe(1);
    wf.kinetic.config({ finish: null });
    expect(over().length).toBe(0);
    expect(root.style.position).toBe('');
  });

  it('the live finish: an element marked data-finish takes the overlays in the root\'s place, and the controls beside it stay clear', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="${uniqueName('lf')}" data-start="0" data-duration="2" data-width="320" data-height="180" data-fps="10" style="width:320px;height:240px"><div data-component="${name}"><div class="picture" data-finish style="width:320px;height:180px;background:#444"></div><div class="controls"><button>Next</button></div></div></div>`);
    cleanup.push(host);
    const root = host.querySelector('[data-composition-id]'), picture = host.querySelector('.picture');
    wf.kinetic.config({ finish: { vignette: 0.5, grade: { saturation: 0.5 }, dust: 1 } });
    const over = Array.from(root.querySelectorAll('[data-kinetic-finish]'));
    expect(over.length).toBe(3);
    for (const e of over) expect(e.parentNode).toBe(picture);
    expect(getComputedStyle(picture).position).toBe('relative');
    expect(root.style.position).toBe('');
    await wf.kinetic.seek(0.5);
    await tick(); await tick();
    // The dust canvas is sized to the picture, the element that holds it.
    expect(over[2].width / Math.min(2, devicePixelRatio || 1)).toBe(320);
    expect(over[2].height / Math.min(2, devicePixelRatio || 1)).toBe(180);
    wf.kinetic.config({ finish: null });
    expect(picture.querySelectorAll('[data-kinetic-finish]').length).toBe(0);
    expect(picture.style.position).toBe('');
  });
});
