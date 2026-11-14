/**
 * KN-100 for a time that is an object (diagnostics.js checkTime): the
 * development message names the call as Kinetic takes it, and for a
 * function whose only argument is the time, that is name(t). onFrame() used
 * to print "Kinetic's is onFrame(t, )", with a stray comma. The production
 * build has the code, the where and the link only.
 */
import { describe, it, expect } from 'vitest';
import { load, expectKN, BUILD, CORE_TIER } from './helpers.js';

describe(`the time a function is given, as an object (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('onFrame({ frame }) names onFrame(t)', async () => {
    const { wf } = await load();
    const err = expectKN(() => wf.kinetic.onFrame({ frame: 3 }), 'KN-100', 'onFrame(t)', "an object there is Remotion's shape, and Kinetic's is onFrame(t)");
    if (BUILD !== 'min') expect(err.message.endsWith("Kinetic's is onFrame(t)")).toBe(true);
  });

  it('a function with more arguments still lists them: ramp(t, from, to, ease)', async () => {
    const { wf } = await load();
    expectKN(() => wf.kinetic.ramp({ frame: 3 }, 0, 1), 'KN-100', 'ramp(t)', "Kinetic's is ramp(t, from, to, ease)");
  });
});
