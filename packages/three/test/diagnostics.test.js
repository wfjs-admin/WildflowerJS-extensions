/**
 * Where a warning goes: through wildflower.diagnostic() when the core is a
 * development build (the core adds the Docs line and keeps the entry in
 * wildflower.diagnostics), and printed by the extension itself when the core
 * has no diagnostic() (wildflowerjs 1.5.4, or a production core). Warnings
 * are development-only, so with the production extension neither prints.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { load, stage, uniq, BUILD, CORE_TIER } from './helpers.js';

let wf, THREE;
const cleanup = [];

beforeAll(async () => { ({ wf, THREE } = await load()); });
afterEach(() => {
  while (cleanup.length) {
    const c = cleanup.pop();
    try { c(); } catch (e) { /* already gone */ }
  }
});

// Every console.warn line `fn` prints, Docs lines included.
async function allWarnings(fn) {
  const lines = [];
  const orig = console.warn;
  console.warn = (...a) => { lines.push(a.map(String).join(' ')); };
  try { await fn(); } finally { console.warn = orig; }
  return lines;
}

// 3D-108: a second view() by the same name.
function viewTwice() {
  const s = stage(THREE);
  const name = uniq('v');
  const opts = { renderer: s.renderer, scene: s.scene, camera: s.camera };
  cleanup.push(() => s.remove());
  cleanup.push(() => { if (wf.getStore(name)) wf.unregister(name); });
  wf.three.view(name, opts);
  wf.three.view(name, opts);
  return name;
}

describe(`warning routing (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('with a development core, a warning goes through wildflower.diagnostic(): kept in wildflower.diagnostics, with the Docs line', async () => {
    if (typeof wf.diagnostic !== 'function') return;   // a production core has no diagnostic()
    const had = wf.diagnostics.length;
    const lines = await allWarnings(async () => { viewTwice(); });
    const ours = wf.diagnostics.slice(had).filter((d) => d.code === '3D-108');
    if (BUILD !== 'dev') {
      expect(ours.length).toBe(0);
      expect(lines.filter((l) => l.includes('3D-108')).length).toBe(0);
      return;
    }
    expect(ours.length).toBe(1);
    expect(ours[0].message).toMatch(/already exists/);
    expect(ours[0].suggestion).toMatch(/Create each view once/);
    expect(lines.some((l) => l.startsWith('  ↳ Docs: ') && l.includes('3D-108'))).toBe(true);
  });

  it('with no wildflower.diagnostic(), the extension prints [3D-nnn] message and the Suggestion line itself', async () => {
    const own = Object.prototype.hasOwnProperty.call(wf, 'diagnostic'), saved = wf.diagnostic;
    wf.diagnostic = undefined;
    let lines;
    try {
      lines = await allWarnings(async () => { viewTwice(); });
    } finally {
      if (own) wf.diagnostic = saved; else delete wf.diagnostic;
    }
    if (BUILD !== 'dev') { expect(lines.filter((l) => l.includes('3D-108')).length).toBe(0); return; }
    const i = lines.findIndex((l) => l.startsWith('[3D-108] '));
    expect(i).not.toBe(-1);
    expect(lines[i]).toMatch(/^\[3D-108\] a view named '.+' already exists; it was returned and these options were ignored$/);
    expect(lines[i + 1]).toMatch(/^ {2}↳ Suggestion: Create each view once/);
    expect(lines.some((l) => l.startsWith('  ↳ Docs: '))).toBe(false);
  });
});
