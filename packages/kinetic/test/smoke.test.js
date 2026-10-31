/**
 * The pieces load: the framework, then the built extension, which installs
 * wildflower.kinetic and survives being loaded twice.
 */
import { describe, it, expect } from 'vitest';
import { load, loadScript, WF_FILE, BUILD, CORE_TIER } from './helpers.js';
import pkg from '../package.json';

describe(`smoke (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('installs wildflower.kinetic with the package version', async () => {
    const { wf } = await load();
    expect(wf.kinetic).toBeTruthy();
    expect(wf.kinetic.version).toBe(pkg.version);
  });

  it('loading the file twice does not throw or replace the namespace', async () => {
    const { wf } = await load();
    const first = wf.kinetic;
    await loadScript(WF_FILE + '?again');
    expect(window.wildflower.kinetic).toBe(first);
  });
});
