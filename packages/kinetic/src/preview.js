/**
 * The preview bar: play, pause, a scrubber, frame steps, a readout, the count
 * of KN lines printed since load, and a Render button (render.js; Cancel
 * while the render runs, aborting the render's signal) and a Check
 * button (check.js) in a plain tab, so a scene file previews with two script
 * tags and no CLI, and renders to an MP4 with no renderer. A WildflowerJS
 * component outside the composition root, bound to the `kinetic` store; its
 * buttons drive wildflower.kinetic, which drives the runtime's player when
 * there is one and the standalone clock otherwise.
 *
 * Mounted after load when asked for: `?preview` in the URL, `data-preview`
 * on the extension's script tag, or config({ preview: true }). Never when a
 * render is capturing (window.__HF_RENDER_CAPTURE_MODE) or `embed` is in the
 * URL, where the page shows the composition alone (fit.js), and
 * config({ preview: false }) removes it.
 *
 * A sound button, a speaker, shows when the composition has an audio clip
 * that Kinetic plays (audio.js): off until pressed, then on and off. The
 * browser starts sound only after a gesture, so pressing it, or the play
 * button, resumes the audio context. The audio layer puts the button in and
 * sets it (sound()), outside the component's bindings.
 *
 * The count is kept by Kinetic's own printing (diagnostics.js counts each
 * KN warning and each KN error it prints) from the moment the extension
 * loads, so a line printed before the bar exists is in it; the console is
 * left as it is. Only the development build prints the warnings, so the
 * production bar says there is no count rather than showing a zero.
 */

import { STORE_NAME } from './names.js';
import { countLines, printError } from './diagnostics.js';
import { isolated } from './fit.js';

const COMPONENT = 'kinetic-preview';
// Set once the bar's component is registered. wf.getComponent() returns
// instances, not definitions, so it cannot tell.
let registered = false;
// The bar wraps onto a second row on a narrow window, so no control ends up
// past the right edge of a fixed bar, where it could not be reached.
const BAR_STYLE = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:6px 10px;'
  + 'background:#14161c;color:#e8e8ee;font:12px/1.2 system-ui,sans-serif;border-top:1px solid #333;box-sizing:border-box';
const BUTTON_STYLE = 'background:#2a2e3a;color:#e8e8ee;border:0;border-radius:4px;padding:4px 9px;font:inherit;cursor:pointer';
const QUIET = '#8b90a0';
const ALERT = '#f2b84b';
const COUNT_STYLE = 'background:none;border:0;padding:0 4px;font:inherit;white-space:nowrap;color:' + QUIET;
// The speaker, then its mark: two waves when the sound is on, a cross when off.
const SPEAKER = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style="display:block"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"></path><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg>';
const MARK_ON = 'M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9';
const MARK_OFF = 'M11 6l4 4m0-4l-4 4';

export function createPreview(wf, api, clock, requested, audio) {
  let bar = null;
  let wanted = requested;
  let verdictTimer = 0;
  // The running render's AbortController, which the bar's Cancel aborts.
  let cancel = null;

  // One frame either way, on the frame grid: from the frame nearest the
  // clock to the one before or after it, between 0 and the end.
  function stepFrame(n) {
    api.pause();
    const { fps, duration } = clock.store;
    const rate = fps || 30;
    let t = (Math.round(clock.now() * rate) + n) / rate;
    if (duration > 0 && t > duration) t = duration;
    api.seek(Math.max(0, t));
  }

  function mount() {
    // A bar the page removed is mounted again.
    if ((bar && bar.isConnected) || isolated()) return;
    if (!registered) {
      registered = true;
      // The warning count's state, computeds, init() and click exist in the
      // development build only; the production bar shows a fixed note.
      wf.component(COMPONENT, Object.assign({
        // The object form: the array form only waits for the store, and
        // onStoreUpdate, which moves the scrubber, would never run.
        subscribe: { [STORE_NAME]: ['time', 'playing'] },
        state: Object.assign({ pos: 0, rendering: '', running: false, verdict: '', checking: false }, __DEV__ ? { warnings: 0 } : null),
        computed: Object.assign({
          readout() {
            if (this.rendering) return this.rendering;
            if (this.verdict) return this.verdict;
            const s = this.stores[STORE_NAME];
            return s.time.toFixed(2) + ' / ' + s.duration.toFixed(2) + ' s   frame ' + s.frame;
          },
          label() { return this.stores[STORE_NAME].playing ? 'Pause' : 'Play'; },
          max() { return this.stores[STORE_NAME].duration || 0; },
          step() { return 1 / (this.stores[STORE_NAME].fps || 30); },
          // A render and a check both move the clock, so neither starts
          // while the other is running.
          busy() { return !!this.rendering || this.checking; },
          // The Render button is Cancel while a render runs, and is off
          // while a check runs or a render's result is up.
          renderLabel() { return this.running ? 'Cancel' : 'Render'; },
          renderOff() { return this.running ? false : !!this.rendering || this.checking; },
        }, __DEV__ ? {
          warningText() { return this.warnings + (this.warnings === 1 ? ' warning' : ' warnings'); },
          warningColor() { return this.warnings ? ALERT : QUIET; },
        } : null),
        // Play is a gesture, so it also lets the sound start.
        toggle() { if (this.stores[STORE_NAME].playing) api.pause(); else { audio.unlock(); api.play(); } },
        back() { stepFrame(-1); },
        forward() { stepFrame(1); },
        scrub() { api.pause(); api.seek(Number(this.pos) || 0); },
        // An MP4 of the whole composition, downloaded when it is done. The
        // readout shows the progress, then the result or the error's code.
        // While it runs the button is Cancel, which aborts the render's
        // signal; the page comes back as after a render.
        async render() {
          if (this.running) { if (cancel) cancel.abort(); return; }
          if (this.rendering || this.checking) return;
          api.pause();
          this.rendering = 'rendering...';
          this.running = true;
          const own = cancel = new AbortController();
          try {
            const r = await api.render({ signal: own.signal, onProgress: (i, n) => { this.rendering = 'rendering ' + i + ' / ' + n; } });
            this.rendering = r.name + ', ' + r.frames + ' frames in ' + (r.ms / 1000).toFixed(1) + ' s';
          } catch (e) {
            // The two things a render most often lacks are named on the bar
            // itself; the message is on the console (in production, the code,
            // where and the link to the code's entry). A cancelled render is
            // no failure.
            const cancelled = own.signal.aborted && e === own.signal.reason;
            if (!cancelled) printError(e);
            const code = e && e.code;
            this.rendering = cancelled ? 'render cancelled'
              : 'render failed' + (code === 'KN-201' ? ' (KN-201): Chrome needs HTML-in-Canvas enabled'
                : code === 'KN-200' ? ' (KN-200): serve the page over https or localhost'
                : code ? ' (' + code + ')' : '');
          }
          if (cancel === own) cancel = null;
          this.running = false;
          setTimeout(() => { this.rendering = ''; }, this.rendering.startsWith('render failed') ? 10000 : 4000);
        },
        // check({ samples: 30 }): the readout says "checking…" while it runs,
        // then the verdict for ten seconds: the frame and property of the
        // first frame that differed, and the report's reason when it has one.
        async check() {
          if (this.rendering || this.checking) return;
          api.pause();
          this.checking = true;
          this.verdict = 'checking…';
          let text;
          try {
            const r = await api.check({ samples: 30 });
            text = r.ok ? 'check ok, ' + r.frames + ' frames'
              : 'check failed' + (r.frame !== undefined ? ' at frame ' + r.frame : '') + (r.property ? ': ' + r.property : '') + (r.reason ? ' (' + r.reason + ')' : '');
          } catch (e) {
            printError(e);
            text = 'check failed' + (e && e.code ? ' (' + e.code + ')' : '');
          }
          this.checking = false;
          this.verdict = text;
          clearTimeout(verdictTimer);
          verdictTimer = setTimeout(() => { this.verdict = ''; }, 10000);
        },
        onStoreUpdate() { this.pos = this.stores[STORE_NAME].time; },
      }, __DEV__ ? {
        // The number is written from a microtask, since a line can print in
        // the middle of a seek the framework is still flushing.
        init() {
          let n = 0;
          const show = () => { if (bar && bar.isConnected) this.warnings = n; };
          n = countLines((total) => { n = total; queueMicrotask(show); });
          this.warnings = n;
        },
        remind() { console.info('Kinetic: the KN warnings and errors print to the browser console; open it to read them.'); },
      } : null));
    }
    bar = document.createElement('div');
    bar.setAttribute('data-component', COMPONENT);
    bar.setAttribute('data-kinetic-preview', '');
    bar.setAttribute('style', BAR_STYLE);
    bar.innerHTML = '<button type="button" style="' + BUTTON_STYLE + '" data-action="toggle" data-bind="label">Play</button>'
      + '<button type="button" style="' + BUTTON_STYLE + '" data-action="back" title="one frame back">&lsaquo;</button>'
      + '<button type="button" style="' + BUTTON_STYLE + '" data-action="forward" title="one frame forward">&rsaquo;</button>'
      + '<input type="range" min="0" data-bind-attr="{ max: max, step: step }" data-model="pos" data-action="input:scrub" style="flex:1 1 160px;min-width:120px;margin:0 6px">'
      + '<span data-bind="readout" style="font-variant-numeric:tabular-nums;white-space:pre"></span>'
      + (__DEV__
        ? '<button type="button" style="' + COUNT_STYLE + ';cursor:pointer" data-kinetic-warnings data-action="remind" data-bind="warningText" data-bind-style="{ color: warningColor }" title="KN lines printed since the page loaded; click for where to read them">0 warnings</button>'
        : '<span style="' + COUNT_STYLE + '" data-kinetic-warnings title="the production build prints no KN warnings; load the development build to see them">production build, no diagnostics</span>')
      + '<button type="button" style="' + BUTTON_STYLE + '" data-action="render" data-bind="renderLabel" data-bind-attr="{ disabled: renderOff }" title="an MP4 of the composition, with WebCodecs">Render</button>'
      + '<button type="button" style="' + BUTTON_STYLE + '" data-action="check" data-bind-attr="{ disabled: busy }" title="seek 30 frames twice and compare them">Check</button>';
    document.body.appendChild(bar);
    wf.scan(bar);
    sound();
  }

  // The sound button as the audio layer stands: absent, off or on. Put in
  // after the frame steps when there is sound to play, with its own
  // listener, and taken out when there is none.
  function sound() {
    if (!bar) return;
    const s = audio.status();
    let b = bar.querySelector('[data-kinetic-sound]');
    if (!s) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('style', BUTTON_STYLE);
      b.setAttribute('data-kinetic-sound', '');
      b.setAttribute('aria-label', 'sound');
      b.innerHTML = SPEAKER;
      b.addEventListener('click', () => audio.toggle());
      bar.querySelector('[data-action="forward"]').after(b);
    }
    b.setAttribute('aria-pressed', String(s === 2));
    b.title = s === 2 ? 'sound on; click to turn it off' : 'sound off; click to turn it on';
    b.lastChild.lastChild.setAttribute('d', s === 2 ? MARK_ON : MARK_OFF);
  }

  function unmount() {
    if (!bar) return;
    bar.remove();
    bar = null;
  }

  function apply() { if (wanted) mount(); else unmount(); }

  return {
    set(on) {
      wanted = !!on;
      if (document.body) apply();
    },
    get() { return wanted; },
    onReady() { if (wanted) mount(); },
    element: () => bar,
    sound,
  };
}

// Whether the page asked for the bar before any config() call. Not keyed
// on wildflower.debug: that is on for every development build, and the bar
// is for the author who asked for it, not for every page in development.
export function previewRequested() {
  try {
    if (/[?&]preview(?:[=&]|$)/.test(self.location.search)) return true;
  } catch (_) { /* no location */ }
  const script = document.currentScript;
  return !!(script && script.hasAttribute('data-preview'));
}
