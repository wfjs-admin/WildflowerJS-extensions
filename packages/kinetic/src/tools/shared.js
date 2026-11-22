/**
 * What the tools' passes share: the composition root, a seek settled the way
 * check() settles one, and a block's text cut short for a report.
 */

export const rootOf = () => document.querySelector('[data-root="true"]') || document.querySelector('[data-composition-id]');

// A seek as check() makes it: hf-seek's waitUntil hands over the seek's
// promise, which settles with the scenes, the pools, the effects and the
// footage. A page on the timeline channel hears no hf-seek, so it is sought
// with seek() and given two frames.
export async function seekTo(k, t) {
  const pending = [];
  self.dispatchEvent(new CustomEvent('hf-seek', { detail: { time: t, waitUntil: (p) => pending.push(p) } }));
  if (pending.length) await Promise.all(pending);
  else {
    k.seek(t);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
}

export const clip = (text) => (text.length > 70 ? text.slice(0, 67) + '...' : text);

// The composition's size in its own pixels, and the scale from the page's
// pixels to them.
export function sizeOf(root) {
  const R = root.getBoundingClientRect();
  const width = Number(root.getAttribute('data-width')) || R.width;
  const height = Number(root.getAttribute('data-height')) || R.height * width / R.width;
  return { R, width, height, s: width / R.width };
}
