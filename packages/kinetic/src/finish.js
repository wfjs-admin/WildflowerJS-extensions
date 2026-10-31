/**
 * The finishing pass: render({ finish }), or config({ finish }) as the
 * default. Each rendered frame, after the shutter's average and before it is
 * encoded, is drawn through WebGL 2 into a canvas of the pass's own, with
 * what a finished composite carries: chromatic aberration and a soften as
 * the frame is sampled, bloom added, a grade, a vignette, grain, and dust.
 * A field left out is off.
 *
 *   finish: {
 *     grain: 0.3,            or { amount, size, fps }: the grain's size in
 *                            pixels (1), and how many times a second it
 *                            changes (0, the default, keeps it still, a
 *                            paper's tooth; the frame rate is film grain)
 *     vignette: 0.4,         or { amount, radius, softness }: where the fall-off
 *                            starts and how wide it is, as fractions of the
 *                            half-diagonal (0.5, 0.6)
 *     bloom: 0.5,            or { amount, threshold, radius }: the colour above
 *                            the threshold (0.8), blurred by the radius in
 *                            pixels (24) and added back, times the amount
 *     aberration: 0.5,       the red and blue channels sampled toward and away
 *                            from the centre, 6 px at the corners for each 1,
 *                            up to 8
 *     soften: 0.5,           a blur that grows toward the edges, 1.5 px for
 *                            each 1, up to 16
 *     dust: 0.5,             or { amount, size }: sparse specks, new each frame
 *     grade: { exposure, contrast, saturation, temperature, lift, gamma, gain }
 *   }
 *
 * The pass reads its uniforms, the frame and the frame's number, never a
 * time or a random number, so a frame is the same bytes on every render,
 * and the dust changes from frame to frame as film's does, from the frame
 * number, and the grain at its fps. A transparent pixel of the frame is sampled as the
 * black the file shows. The bloom is three small passes at a quarter of the
 * frame's size (the colour above the threshold, a blur across, a blur
 * down); the rest is one pass over the frame.
 *
 * readFinish(v, call) checks the option (KN-100, its where naming the field
 * and the part that failed) and returns the fields that are on, each as an
 * array of its parts in FIELDS' order, or null when none is. createFinish(spec,
 * fps) makes the pass for those fields at the composition's frame rate:
 * apply(src, i) draws the canvas `src` as frame i into the pass's canvas and
 * returns it, sized to `src`; dispose() loses the context.
 */

import { CODES, fail, show } from './diagnostics.js';
import { compositionRoot } from './timing.js';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Each field's parts: name, default, lowest, highest. A field given as a
// number is its first part; a grade is always an object.
const FIELDS = {
  grain: [['amount', 0, 0, 1], ['size', 1, 1, 8], ['fps', 0, 0, 240]],
  vignette: [['amount', 0, 0, 1], ['radius', 0.5, 0, 1], ['softness', 0.6, 0.05, 1]],
  bloom: [['amount', 0, 0, 2], ['threshold', 0.8, 0, 1], ['radius', 24, 1, 200]],
  aberration: [['amount', 0, 0, 8]],
  soften: [['amount', 0, 0, 16]],
  dust: [['amount', 0, 0, 1], ['size', 1, 0.5, 4]],
  grade: [['exposure', 0, -3, 3], ['contrast', 1, 0, 3], ['saturation', 1, 0, 3], ['temperature', 0, -1, 1], ['lift', 0, -0.5, 0.5], ['gamma', 1, 0.2, 5], ['gain', 1, 0, 3]],
};
const NAMES = Object.keys(FIELDS).join(', ');
// Where each field's parts sit in the pass's uniform array; the grain's fps
// is not among them, since the grain's frame number (G) carries it.
const SLOT = { grain: 0, vignette: 2, bloom: 5, aberration: 8, soften: 9, dust: 10, grade: 12 };

// The finish as config() reports it: each field on, as an object of its
// named parts, the form config({ finish }) takes, so a setting read can be
// put back.
export function reportFinish(spec) {
  const out = {};
  for (const k in spec) {
    out[k] = {};
    FIELDS[k].forEach(([name], i) => { out[k][name] = spec[k][i]; });
  }
  return out;
}

export function readFinish(v, call) {
  if (v == null || v === false || v === 0) return null;
  if (typeof v !== 'object' || Array.isArray(v)) throw fail(CODES.BAD_CALL, call + '({ finish })', __DEV__ && 'finish is an object of fields (' + NAMES + '), or 0, false or null, not ' + show(v));
  const out = {};
  let any = false;
  for (const k in v) {
    if (!own(FIELDS, k)) throw fail(CODES.BAD_CALL, call + '({ finish: { ' + k + ' } })', __DEV__ && "'" + k + "' is not a field of finish; the fields are " + NAMES);
    const parts = FIELDS[k], given = v[k];
    if (given == null || given === false) continue;
    const names = parts.map((p) => p[0]).join(', ');
    const o = typeof given === 'number' && k !== 'grade' ? { [parts[0][0]]: given } : given && typeof given === 'object' && !Array.isArray(given) ? given : null;
    if (!o) throw fail(CODES.BAD_CALL, call + '({ finish: { ' + k + ' } })', __DEV__ && k + ' is ' + (k === 'grade' ? '' : 'a number, its ' + parts[0][0] + ', or ') + 'an object of ' + names + ', not ' + show(given));
    for (const key in o) if (!parts.some((p) => p[0] === key)) throw fail(CODES.BAD_CALL, call + '({ finish: { ' + k + ': { ' + key + ' } } })', __DEV__ && "'" + key + "' is not a part of " + k + '; the parts are ' + names);
    const vals = parts.map(([name, dflt, lo, hi]) => {
      const x = o[name] === undefined ? dflt : o[name];
      if (!(typeof x === 'number' && x >= lo && x <= hi)) throw fail(CODES.BAD_CALL, call + '({ finish: { ' + k + ': { ' + name + ' } } })', __DEV__ && name + ' is a number from ' + lo + ' to ' + hi + ', not ' + show(x));
      return x;
    });
    // Off at an amount of 0, or a grade whose every part is its default.
    if (k === 'grade' ? parts.every((p, i) => vals[i] === p[1]) : vals[0] === 0) continue;
    out[k] = vals;
    any = true;
  }
  return any ? out : null;
}

// ---- the pass ---------------------------------------------------------------------

// A full-screen triangle, v its 0 to 1 coordinates.
const VERT = '#version 300 es\nout vec2 v;void main(){vec2 q=vec2(gl_VertexID&1,gl_VertexID>>1)*2.;v=q;gl_Position=vec4(q*2.-1.,0,1);}';
// S the frame, B the bloom, Z the pass's size in pixels, F the frame number,
// G the grain's, U the fields' parts (SLOT). L is luma, H a hash of a cell
// and the frame, T the frame sampled with its alpha multiplied in.
const HEAD = '#version 300 es\nprecision highp float;in vec2 v;uniform sampler2D S,B;uniform vec2 Z;uniform float F,G,U[20];out vec4 o;'
  + 'float L(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}'
  + 'float H(uvec3 u){u=u*1664525u+1013904223u;u.x+=u.y*u.z;u.y+=u.z*u.x;u.z+=u.x*u.y;u^=u>>16u;u.x+=u.y*u.z;u.y+=u.z*u.x;u.z+=u.x*u.y;return float(u.x&0xffffffu)/16777216.;}'
  + 'vec3 T(vec2 p){vec4 s=texture(S,p);return s.rgb*s.a;}';
// The colour above the bloom's threshold, four taps, at a quarter of the size.
const BRIGHT = HEAD + 'void main(){vec2 x=1./Z;vec3 c=(T(v+x*vec2(-1,-1))+T(v+x*vec2(1,-1))+T(v+x*vec2(-1,1))+T(v+x*vec2(1,1)))*.25;o=vec4(c*smoothstep(U[6]-.1,U[6]+.1,L(c)),1);}';
// A gaussian along D, the bloom's radius in the quarter's pixels.
const BLUR = HEAD + 'uniform vec2 D;void main(){float r=max(U[7]*.25,.5),g=r/2.5,s=r/6.,n=0.,w;vec3 c=vec3(0);for(int i=-6;i<=6;i++){float x=float(i)*s;w=exp(-x*x/(2.*g*g));c+=texture(S,v+D*x/Z).rgb*w;n+=w;}o=vec4(c/n,1);}';
// The frame sampled with the aberration (P), softened (48 taps spread over a
// disc, so a wide soften stays a blur, mixed in fully from an amount of 1),
// the bloom added, the
// grade, the vignette, the grain by cell and its frame, and the dust: a cell of
// 10 px gets a speck when its hash for the frame is under the amount, at a
// hashed place and size.
const COMP = HEAD + 'vec3 P(vec2 p,vec2 d){return vec3(T(p-d).r,T(p).g,T(p+d).b);}'
  + 'void main(){vec2 c=v-.5;float r=length(c)/.7071;vec2 d=r>0.?normalize(c)*(U[8]*r*r*6.)/Z:vec2(0);vec3 k=P(v,d);'
  + 'if(U[9]>0.){vec2 e=U[9]*(.5+r)/Z;vec3 s=vec3(0);for(int i=0;i<48;i++){float a=float(i)*2.39996,q=sqrt((float(i)+.5)/48.);s+=P(v+e*q*vec2(cos(a),sin(a)),d);}k=mix(k,s/48.,min(U[9],1.));}'
  + 'k+=U[5]*texture(B,v).rgb;'
  + 'k*=exp2(U[12]);k=(k-.5)*U[13]+.5;k=mix(vec3(L(k)),k,U[14]);k+=U[15]*vec3(.06,.02,-.06);k=pow(max(k*U[18]+U[16]*(1.-k),0.),vec3(1./U[17]));'
  + 'k*=1.-U[2]*smoothstep(U[3],U[3]+U[4],r);'
  + 'if(U[0]>0.){float g=H(uvec3(uvec2(gl_FragCoord.xy/U[1]),uint(G)+7u)),l=L(k);k+=(g-.5)*U[0]*.5*(.2+4.*l*(1.-l));}'
  + 'if(U[10]>0.){uvec2 q=uvec2(gl_FragCoord.xy/10.);uint f=uint(F)*13u;if(H(uvec3(q,f+1u))<U[10]*.035){vec2 m=(vec2(q)+vec2(H(uvec3(q,f+2u)),H(uvec3(q,f+3u))))*10.;float a=(.7+1.3*H(uvec3(q,f+4u)))*U[11],s=distance(gl_FragCoord.xy,m);k=mix(k,vec3(.95,.93,.88),(1.-smoothstep(a-.7,a+.7,s))*U[10]);}}'
  + 'o=vec4(clamp(k,0.,1.),1);}';

// The grain's frame number for frame f at the composition's fps: a new one
// `rate` times a second, and always the same with a rate of 0.
const grainFrame = (f, fps, rate) => (rate > 0 ? Math.floor(f * rate / fps + 1e-6) : 0);

export function createFinish(spec, fps) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
  if (!gl) throw fail(CODES.BAD_CALL, 'render({ finish }): WebGL 2', __DEV__ && 'the finish draws each frame through WebGL 2, which this browser has turned off');
  // The parts, with the defaults of the fields that are off: a grade that
  // changes nothing, sizes of 1, and the bloom's threshold and radius.
  const u = new Float32Array(20);
  u[1] = u[11] = u[13] = u[14] = u[17] = u[18] = 1; u[3] = 0.5; u[4] = 0.6; u[6] = 0.8; u[7] = 24;
  for (const k in spec) (k === 'grain' ? spec[k].slice(0, 2) : spec[k]).forEach((x, i) => { u[SLOT[k] + i] = x; });
  const rate = spec.grain ? spec.grain[2] : 0;
  const bloom = !!spec.bloom;

  function program(frag) {
    const p = gl.createProgram();
    for (const [type, text] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, frag]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, text);
      gl.compileShader(sh);
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (__DEV__ && !gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('finish: ' + gl.getProgramInfoLog(p));
    const at = {};
    for (const n of ['S', 'B', 'Z', 'F', 'G', 'U', 'D']) at[n] = gl.getUniformLocation(p, n);
    gl.useProgram(p);
    gl.uniform1i(at.S, 0);
    gl.uniform1i(at.B, 1);
    gl.uniform1fv(at.U, u);
    return { p, at };
  }
  function texture(w, h) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, val] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, val);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }
  // The frame's texture, a black pixel for the bloom when there is none,
  // and the bloom's three quarter-size targets, sized with the frame.
  const frame = texture();
  const black = texture(1, 1);
  const comp = program(COMP);
  const bright = bloom ? program(BRIGHT) : null, blur = bloom ? program(BLUR) : null;
  const targets = bloom ? [0, 1, 2].map(() => ({ t: texture(1, 1), fb: gl.createFramebuffer() })) : null;
  if (bloom) for (const q of targets) { gl.bindFramebuffer(gl.FRAMEBUFFER, q.fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, q.t, 0); }
  let qw = 0, qh = 0;

  function pass(prog, fb, w, h, z, i) {
    gl.useProgram(prog.p);
    gl.uniform2f(prog.at.Z, z[0], z[1]);
    gl.uniform1f(prog.at.F, i);
    gl.uniform1f(prog.at.G, grainFrame(i, fps, rate));
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    canvas,
    apply(src, i) {
      const w = src.width, h = src.height;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        if (bloom) {
          qw = Math.max(1, Math.round(w / 4)); qh = Math.max(1, Math.round(h / 4));
          for (const q of targets) { gl.bindTexture(gl.TEXTURE_2D, q.t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, qw, qh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); }
        }
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, frame);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, black);
      if (bloom) {
        const [a, b, c] = targets;
        pass(bright, a.fb, qw, qh, [w, h], i);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, a.t);
        gl.useProgram(blur.p); gl.uniform2f(blur.at.D, 1, 0);
        pass(blur, b.fb, qw, qh, [qw, qh], i);
        gl.bindTexture(gl.TEXTURE_2D, b.t);
        gl.useProgram(blur.p); gl.uniform2f(blur.at.D, 0, 1);
        pass(blur, c.fb, qw, qh, [qw, qh], i);
        gl.bindTexture(gl.TEXTURE_2D, frame);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, c.t);
      }
      pass(comp, null, w, h, [w, h], i);
      return canvas;
    },
    dispose() {
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    },
  };
}

// ---- the live finish -----------------------------------------------------------

// The finish in the page, where the browser can carry it, from the same
// config({ finish }), so the page and the file agree: overlays Kinetic
// keeps as the composition root's last children, over everything in it and
// under the pointer. The vignette is a radial gradient from the same radius
// and softness; the grain a noise tile blended with overlay, moved to a
// hashed offset for its frame on every seek; the dust drawn on a canvas by the shader's
// hash, cell for cell; the grade's exposure, contrast and saturation, and
// the soften, a backdrop-filter. The bloom, the aberration and the grade's
// temperature, lift, gamma and gain have no live form. A render hides the
// overlays (hide(), show()), since the pass finishes the file; check()
// keeps them, since they are the same for a frame on every seek. sync(spec)
// rebuilds them for a new setting; draw(t) rebuilds them when the setting
// has changed since, moves the grain and draws the dust for the frame at
// t, from the clock's landed hook and from readiness. An element in the root
// marked data-finish takes the overlays in the root's place, so controls
// beside it, a lesson's or an interactive's, stay clear of them. The element
// that holds them, when its position is static, is given position: relative
// while they are in it.
export const LIVE_ATTR = 'data-kinetic-finish';
const HOST_ATTR = 'data-finish';

// The shader's H() in JavaScript, on three whole numbers.
function hashJs(x, y, z) {
  let a = (Math.imul(x, 1664525) + 1013904223) >>> 0, b = (Math.imul(y, 1664525) + 1013904223) >>> 0, c = (Math.imul(z, 1664525) + 1013904223) >>> 0;
  a = (a + Math.imul(b, c)) >>> 0; b = (b + Math.imul(c, a)) >>> 0; c = (c + Math.imul(a, b)) >>> 0;
  a = (a ^ (a >>> 16)) >>> 0; b = (b ^ (b >>> 16)) >>> 0; c = (c ^ (c >>> 16)) >>> 0;
  a = (a + Math.imul(b, c)) >>> 0; b = (b + Math.imul(c, a)) >>> 0; c = (c + Math.imul(a, b)) >>> 0;
  return (a & 0xffffff) / 16777216;
}

export function createFinishLive(clock) {
  let spec = null, root = null, els = [], grain = null, dust = null, hidden = false, placed = false, tile = null;

  // A 256 px tile of grey noise about the middle, made once.
  function noise() {
    if (tile) return tile;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d'), d = g.createImageData(256, 256);
    for (let i = 0, p = 0; i < 65536; i++, p += 4) {
      const v = Math.max(0, Math.min(255, Math.round(128 + (hashJs(i & 255, i >> 8, 3) - 0.5) * 255)));
      d.data[p] = d.data[p + 1] = d.data[p + 2] = v;
      d.data[p + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    return (tile = c.toDataURL());
  }
  function remove() {
    for (const e of els) e.remove();
    els = [];
    grain = dust = null;
    if (placed && root) root.style.position = '';
    placed = false;
    root = null;
  }
  function build() {
    remove();
    if (!spec) return;
    const top = compositionRoot(document);
    if (!top) return;
    root = top.querySelector('[' + HOST_ATTR + ']') || top;
    if (getComputedStyle(root).position === 'static') { root.style.position = 'relative'; placed = true; }
    const add = (tag, style) => {
      const el = document.createElement(tag);
      el.setAttribute(LIVE_ATTR, '');
      el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2147483000;' + style + (hidden ? ';display:none' : '');
      root.appendChild(el);
      els.push(el);
      return el;
    };
    const { vignette: v, grain: g, dust: d, grade: gr, soften: so } = spec;
    // The backdrop first, so the grain and the vignette above it are not
    // filtered, as in the pass.
    if (gr || so) add('div', 'backdrop-filter:' + (gr ? 'brightness(' + Math.pow(2, gr[0]) + ') contrast(' + gr[1] + ') saturate(' + gr[2] + ')' : '') + (so ? ' blur(' + so[0] * 0.75 + 'px)' : ''));
    if (v) add('div', 'background:radial-gradient(ellipse farthest-corner at center,rgba(0,0,0,0) ' + v[1] * 100 + '%,rgba(0,0,0,' + v[0] + ') ' + (v[1] + v[2]) * 100 + '%)');
    if (g) grain = add('div', 'background-image:url(' + noise() + ');background-size:' + 256 * g[1] + 'px ' + 256 * g[1] + 'px;mix-blend-mode:overlay;opacity:' + Math.min(1, 0.6 * g[0]));
    if (d) dust = add('canvas', 'width:100%;height:100%');
  }
  // The dust for frame f: the shader's cells of 10 px counted from the
  // bottom, a speck where the cell's hash for the frame is under the amount,
  // at the hashed place and size.
  function drawDust(f) {
    const w = root.offsetWidth, h = root.offsetHeight, dpr = Math.min(2, self.devicePixelRatio || 1);
    if (!w || !h) return;
    if (dust.width !== Math.round(w * dpr) || dust.height !== Math.round(h * dpr)) { dust.width = Math.round(w * dpr); dust.height = Math.round(h * dpr); }
    const g = dust.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, dust.width, dust.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const [amount, size] = spec.dust, ff = (f * 13) >>> 0, cols = Math.ceil(w / 10), rows = Math.ceil(h / 10);
    g.fillStyle = 'rgba(242,237,224,' + amount + ')';
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (hashJs(cx, cy, ff + 1) >= amount * 0.035) continue;
        const x = (cx + hashJs(cx, cy, ff + 2)) * 10, y = h - (cy + hashJs(cx, cy, ff + 3)) * 10, r = (0.7 + 1.3 * hashJs(cx, cy, ff + 4)) * size;
        g.beginPath();
        g.arc(x, y, r, 0, 6.2832);
        g.fill();
      }
    }
  }
  function draw(t) {
    const s = clock.finish();
    if (s !== spec) { spec = s; build(); } else if (spec && !root) build();
    if (!spec || !root) return;
    const f = Math.round(t * clock.store.fps);
    if (grain) { const n = grainFrame(f, clock.store.fps, spec.grain[2]); grain.style.backgroundPosition = Math.round(hashJs(n, 1, 7) * 256) + 'px ' + Math.round(hashJs(n, 2, 7) * 256) + 'px'; }
    if (dust) drawDust(f);
  }
  return {
    draw,
    sync(s) { spec = s; build(); },
    hide() { hidden = true; for (const e of els) e.style.display = 'none'; },
    show() { hidden = false; for (const e of els) e.style.display = ''; },
  };
}
