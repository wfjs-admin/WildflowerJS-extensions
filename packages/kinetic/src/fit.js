/**
 * The page around the composition.
 *
 * In a render's capture (window.__HF_RENDER_CAPTURE_MODE, which the
 * HyperFrames CLI sets before any script runs) or with `embed` in the URL,
 * the composition alone. The CLI captures the window's top left corner at
 * the composition's size, so a toolbar above the stage would be in every
 * frame. The extension hides every element beside the root and beside each
 * of its ancestors up to body's children (script, style, link and template
 * elements are left alone), zeroes the margin and padding of each ancestor
 * and the root's own margin, and so leaves the root at the window's top
 * left at its own size. It does this once the page is parsed and again when
 * readiness settles, before the runtime is told frame 0 may be captured, so
 * an element a script added in between is hidden too. The preview bar is
 * never mounted then. Under ?embed the fit below still applies; in a render
 * it never does. Outside the two cases nothing is touched.
 *
 * Outside a render, html and body. The HyperFrames runtime sets margin 0,
 * padding 0 and overflow hidden on html and body as it starts, and gives
 * both the composition's width and height, which it writes again on later
 * layout passes (probed: as it
 * becomes ready, and when playback starts). A render's capture needs that; a page
 * with anything beside the composition loses its scrolling and its width.
 * Outside a render (window.__HF_RENDER_CAPTURE_MODE unset) the extension takes
 * those properties off again, watching the two elements' style attributes:
 * margin, padding and overflow once, the first time it sees the runtime, and
 * the width and height each time the runtime writes them. Only a property
 * holding the value the runtime writes is removed, so the page's stylesheet
 * applies again and a later overflow of the page's own stays. With no runtime
 * on the page there is nothing to undo, and in a render nothing is touched.
 *
 * config({ fit }): the stage fitted to the window. On by default when the
 * preview bar is asked for (?preview, data-preview, config({ preview: true })).
 * The root is moved into a plain element the extension owns,
 * <div class="kinetic-fit">, as wide as data-width and no wider than its
 * container, with the root's aspect ratio, and the root is scaled from its
 * top left corner by k = min(1, the wrapper's width / data-width), so its
 * layout stays data-width by data-height. A ResizeObserver on the wrapper
 * recomputes k. The wrapper is no component, so a scene directly inside the
 * root has no parent component. Applied before readiness marks the root
 * shown, undone when fit is turned off, and never in a render. render()
 * moves the root into a canvas inside the wrapper; refresh() then moves the
 * scale onto the canvas, so the root draws at its own size.
 *
 * The stage's size. A root whose width or height the page leaves at auto
 * (no style sheet rule and no style attribute gives it one) gets
 * data-width or data-height in px on its style attribute, once per root:
 * when the page is parsed, and at the start of each run of readiness for a
 * root added later, so before the page is shown. A size the page gives the
 * root, from either place, is left as it is, and so is a height that an
 * aspect-ratio of the page's own follows from. The computed value tells
 * auto apart where getComputedStyle reports the used size: it is read from
 * computedStyleMap(), or without it from getComputedStyle while the root is
 * display: none for the read, where the resolved value is the computed one.
 * In a render too, so a page that renders through the runtime has its size.
 */

import { compositionRoot } from './timing.js';

const STARTUP = [['margin', '0px'], ['padding', '0px'], ['overflow', 'hidden']];
const WRAP_STYLE = 'position:relative;margin:0 auto;max-width:100%;overflow:hidden;';
const LEFT_ALONE = ['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE'];

const rendering = () => !!self.__HF_RENDER_CAPTURE_MODE;

// `embed` in the URL (embed.js listens to the parent then).
export function embedded() {
  try { return /[?&]embed(?:[=&]|$)/.test(self.location.search); } catch (_) { return false; }
}

// A render's capture, or `embed` in the URL: the page shows the composition
// alone. Read on every call, like the flag.
export function isolated() {
  return rendering() || embedded();
}

// Hides what sits beside the root and its ancestors and takes away the
// space around them, with !important so the page's stylesheet cannot put
// them back. Run again, it writes the same values.
// Whether the page gives the root a width, a height and an aspect-ratio of
// its own: a computed value that is not auto.
function ownSize(root) {
  if (typeof root.computedStyleMap === 'function') {
    const m = root.computedStyleMap();
    const set = (k) => String(m.get(k)) !== 'auto';
    return { width: set('width'), height: set('height'), ratio: set('aspect-ratio') };
  }
  const attr = root.getAttribute('style');
  root.style.setProperty('display', 'none', 'important');
  const cs = getComputedStyle(root);
  const own = { width: cs.width !== 'auto', height: cs.height !== 'auto', ratio: !!cs.aspectRatio && cs.aspectRatio !== 'auto' };
  if (attr === null) root.removeAttribute('style');
  else root.setAttribute('style', attr);
  return own;
}

const sized = new WeakSet();   // roots whose size has been looked at

// The root's width and height from data-width and data-height, where the
// page leaves them at auto (the header).
export function sizeStage() {
  const root = compositionRoot(document);
  if (!root || !root.isConnected || sized.has(root)) return;
  const W = Number(root.getAttribute('data-width')), H = Number(root.getAttribute('data-height'));
  if (!(W > 0 && H > 0)) return;
  sized.add(root);
  const own = ownSize(root);
  if (!own.width) root.style.width = W + 'px';
  if (!own.height && !own.ratio) root.style.height = H + 'px';
}

function isolate() {
  const root = compositionRoot(document);
  const html = document.documentElement;
  if (!root || !html.contains(root)) return;
  const set = (el, k, v) => el.style.setProperty(k, v, 'important');
  set(root, 'margin', '0');
  for (let el = root; el !== html; el = el.parentElement) {
    const parent = el.parentElement;
    if (el !== document.body) {
      for (const sib of parent.children) if (sib !== el && !LEFT_ALONE.includes(sib.tagName)) set(sib, 'display', 'none');
    }
    set(parent, 'margin', '0');
    set(parent, 'padding', '0');
  }
}

export function createFit(clock, previewWanted) {
  let startupUndone = false;
  let wanted = null;          // config({ fit }); null follows the preview bar
  let wrap = null;            // the wrapper, while the root is fitted
  let width = 0;              // the root's data-width, while it is fitted
  let scaled = null;          // the element carrying the scale: the root, or render()'s canvas
  let saved = null;           // that element's own transform and transform-origin
  let ro = null;

  const dims = (root) => [Number(root.getAttribute('data-width')), Number(root.getAttribute('data-height'))];

  // ---- html and body --------------------------------------------------------

  function restore() {
    if (rendering() || !clock.hasRuntime()) return;
    const root = compositionRoot(document);
    const [W, H] = root ? dims(root) : [];
    // Under ?embed the margin and padding are the isolation's.
    const startup = isolated() ? STARTUP.slice(2) : STARTUP;
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      const s = el.style;
      if (!startupUndone) for (const [k, v] of startup) if (s[k] === v) s.removeProperty(k);
      if (s.width === W + 'px') s.removeProperty('width');
      if (s.height === H + 'px') s.removeProperty('height');
    }
    startupUndone = true;
  }

  function watch() {
    if (rendering()) return;
    const mo = new MutationObserver(restore);
    const opts = { attributes: true, attributeFilter: ['style'] };
    mo.observe(document.documentElement, opts);
    const withBody = () => { mo.observe(document.body, opts); restore(); };
    if (document.body) withBody();
    else document.addEventListener('DOMContentLoaded', withBody, { once: true });
  }

  // ---- the fit --------------------------------------------------------------

  const on = () => (wanted !== null ? wanted : previewWanted());

  function unscale() {
    if (!scaled) return;
    scaled.style.transform = saved[0];
    scaled.style.transformOrigin = saved[1];
    scaled = saved = null;
  }

  // Scales whatever sits in the wrapper: the root, or the canvas render()
  // put around it. The wrapper's height follows from its aspect ratio, so
  // only the transform is written here and the observer never loops.
  function scale() {
    const el = wrap.firstElementChild;
    if (el !== scaled) {
      unscale();
      if (!el) return;
      scaled = el;
      saved = [el.style.transform, el.style.transformOrigin];
    }
    // 0 while the wrapper is not laid out (inside display: none); the
    // observer calls again once it is.
    const room = wrap.clientWidth;
    if (!(room > 0)) return;
    el.style.transformOrigin = '0 0';
    el.style.transform = 'scale(' + Math.min(1, room / width) + ')';
  }

  function unwrap() {
    ro.disconnect();
    unscale();
    const parent = wrap.parentNode;
    if (parent) while (wrap.firstChild) parent.insertBefore(wrap.firstChild, wrap);
    wrap.remove();
    wrap = null;
  }

  function place() {
    const root = compositionRoot(document);
    const [W, H] = root ? dims(root) : [0, 0];
    const fit = on() && W > 0 && H > 0;
    if (wrap && (!fit || !wrap.contains(root))) unwrap();
    if (!fit) return;
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'kinetic-fit';
      root.parentNode.insertBefore(wrap, root);
      wrap.appendChild(root);
      ro = new ResizeObserver(() => { if (wrap) scale(); });
      ro.observe(wrap);
    }
    width = W;
    wrap.setAttribute('style', WRAP_STYLE + 'width:' + W + 'px;aspect-ratio:' + W + ' / ' + H);
    scale();
  }

  // The stage's size, the fit, outside a render, then the isolation, which
  // also reaches the wrapper the fit put around the root.
  function sync() {
    sizeStage();
    if (!rendering()) place();
    if (isolated()) isolate();
  }

  return {
    // The undo starts watching, and the fit applies once the root is parsed.
    start() {
      watch();
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync, { once: true });
      else sync();
    },
    set(v) { wanted = !!v; },
    get: () => !!on(),
    sync,
    size: sizeStage,
    refresh() { if (wrap) scale(); },
  };
}
