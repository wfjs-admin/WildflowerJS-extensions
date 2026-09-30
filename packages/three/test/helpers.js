/**
 * Shared set-up for the three extension's suite: the framework tier file,
 * then the built extension, each through a classic <script src> as a page
 * loads them, and three.js from the pinned copy in tools/three/.
 */

export const BUILD = typeof __THREE_EXT_BUILD__ !== 'undefined' ? __THREE_EXT_BUILD__ : 'dev';
export const CORE = typeof __THREE_EXT_CORE__ !== 'undefined' ? __THREE_EXT_CORE__ : '/www/js/dist/wildflower.full.dev.js';
export const WF_FILE = typeof __THREE_EXT_FILE__ !== 'undefined' ? __THREE_EXT_FILE__ : '/packages/three/dist/three.wf.js';
export const CORE_TIER = (CORE.match(/wildflower(?:\.([\w-]+?))?(?:\.(dev|min))?\.js$/) || [])[1] || 'standard';

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
}

let loaded = null;
// { wf, THREE }: the framework with the extension installed, and three.js
// already handed to it with use().
export function load() {
  if (loaded) return loaded;
  loaded = (async () => {
    await loadScript(CORE);
    await loadScript(WF_FILE).catch(() => { throw new Error('could not load ' + WF_FILE + '; build it first: node scripts/build-rollup.cjs three.wf'); });
    const THREE = await import(/* @vite-ignore */ '/tools/three/build/three.module.js')
      .catch(() => { throw new Error('three.js is missing; fetch it first: node scripts/fetch-three.cjs'); });
    const wf = window.wildflower;
    wf.three.use(THREE);
    return { wf, THREE };
  })();
  return loaded;
}

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
export const frames = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); await tick(0); };

export async function captureWarnings(fn) {
  const lines = [];
  const orig = console.warn;
  console.warn = (...a) => { lines.push(a.map(String).join(' ')); };
  try { await fn(); } finally { console.warn = orig; }
  return lines;
}

let n = 0;
export const uniq = (base) => base + (++n);

// A canvas in the page at a fixed size, a renderer on it, a scene and a
// camera at z = 5 looking at the origin (so +Z faces the camera).
export function stage(THREE, width = 400, height = 300) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:' + width + 'px;height:' + height + 'px';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  host.appendChild(canvas);
  document.body.appendChild(host);
  const renderer = new THREE.WebGLRenderer({ canvas });
  renderer.setSize(width, height);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { host, canvas, renderer, scene, camera, remove() { renderer.dispose(); host.remove(); } };
}

// An InstancedMesh of small planes facing +Z (towards the camera), added to the scene.
export function planes(THREE, scene, count = 16, size = 0.3) {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), count);
  scene.add(mesh);
  return mesh;
}

// Client coordinates of a world point, for pointer events on the canvas.
export function clientAt(view, canvas, x, y, z) {
  const p = view.projectPoint(x, y, z), r = canvas.getBoundingClientRect();
  return { clientX: r.left + p.x, clientY: r.top + p.y };
}

export function pointer(canvas, type, at) {
  canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: at.clientX, clientY: at.clientY }));
}
