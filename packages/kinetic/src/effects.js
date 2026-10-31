/**
 * effect(canvas, { scene, source, kind, ...params }): a shader effect on an <img>,
 * <video> or <canvas>, drawn with WebGL 2 into a canvas. Returns a handle
 * with set(params) and dispose().
 *
 *   halftone  a dot in each cell of a grid turned by `angle`, `cell` px
 *             apart, its area the source's darkness at the cell's centre,
 *             growing to fill the cell at full darkness; a circle, a square
 *             or a line; in ink, or with color: 'source' in the source's
 *             colour there
 *   stipple   ink in each `scale` px square whose seeded hash is under the
 *             source's darkness there; with `grade` (0 to 1) the speck
 *             shrinks toward the cell's centre where the darkness is low,
 *             and speck: 'round' makes it a dot; with color: 'source' each
 *             speck is in the source's colour there
 *   dither    an ordered dither on a Bayer matrix of 2, 4 or 8, in `levels`
 *             steps from ink to paper, the ink the source's colour with
 *             color: 'source'
 *   duotone   the source's brightness from shadow to highlight
 *   boil      the source itself, each pixel taken from up to `amount` px
 *             away by smooth seeded noise `scale` px across, in `rough`
 *             octaves (1 to 6): edges that wobble, drawn again with each
 *             new seed
 *   splatter  round drops of ink from `max` px across down to `min` px,
 *             in up to six sizes spread evenly between (each about half
 *             the last), one drop at a seeded place in each cell of its
 *             size, inked when a seeded hash is under the source's
 *             darkness there (raised to a higher power for larger drops,
 *             so large drops come only where it is dark), from half its
 *             size to all of it, and smaller where it is lighter; `warp`
 *             (0 to 1) roughens a drop's edge and `vary` (0 to 1) prints
 *             each drop at its own strength, as spray leaves them
 *
 * Brightness is the sRGB luma (0.2126, 0.7152, 0.0722), a transparent
 * source pixel reading as white. density (-1 to 1) moves halftone, stipple,
 * splatter and duotone toward ink or the shadow, and contrast stretches the brightness
 * about its middle. The shaders read only the uniforms, the source and an
 * integer hash, never a time or a random number, so a frame is the same on
 * every draw.
 *
 * scene: this, given in a scene's own methods, ties the effect to that
 * scene: it follows the scene's local time and is disposed with the scene,
 * wherever and whenever it was made. Without it, an effect follows the
 * composition time and lasts until dispose(). Anything but a scene's
 * component is KN-100, and set() cannot change it.
 *
 * fps: n (stipple, splatter and boil) moves the seed on n times a second
 * of that time, and delay: s holds it for s seconds first; both can be
 * changed with set().
 *
 * The canvas gets a WebGL 2 context with preserveDrawingBuffer, so check()'s
 * canvas hash and render()'s canvas copies read it. Its drawing size is the
 * size it is shown at (its box after transforms, such as the fitted stage's
 * scale) times the device pixel ratio, at most its CSS box times that ratio,
 * and inside render()'s wrapper its CSS box, the composition's own scale. A
 * canvas with no CSS size of its own takes its size from those drawing
 * dimensions, so on the first resize that would grow it, its CSS size is
 * held where it was. The source is stretched over the canvas.
 *
 * Every live effect is drawn after each seek has settled, once the footage
 * has landed (the clock's land hooks), so a <video> source shows the frame
 * of the seek; while the clock plays, that is each frame. An effect is
 * drawn again only when its parameters, its size or its source's frame have
 * changed: an <img> once it has loaded (drawn on its load event too, so one
 * that loads while the clock is paused shows) or its source changes, a
 * <video> when its time moves, a <canvas> on every seek, since nothing tells
 * when one has been drawn on. Readiness waits for each <img> source to
 * decode, and draws each effect once before the page shows.
 *
 * An effect made with a scene is disposed when that scene is destroyed,
 * wherever its canvas is, and any effect whose canvas has left the page is
 * disposed at the next seek. A
 * context the browser loses (it drops the oldest when a page holds too
 * many) draws nothing until it is restored; development builds warn
 * (KN-191), and a restored context is set up again and drawn at the next
 * seek. A canvas holds one live effect: effect() on a canvas whose effect
 * is still live is KN-100.
 *
 * Errors, thrown on every build: KN-100 for a bad call, or a canvas with no
 * WebGL 2 context; KN-204 at the first draw of a source from another origin
 * without CORS, which WebGL cannot read, once for that source, which is
 * then skipped until it changes.
 */
import { CODES, fail, show, warn, openedContext } from './diagnostics.js';
import { parseColor } from './motion.js';
import { clipName } from './clips.js';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Each kind's parameters and defaults, in the order the shader takes them:
// numbers into A and then B (a choice as its index), `color` into C, and
// the two colours into I and Q.
const KINDS = {
  halftone: { cell: 12, angle: 45, density: 0, shape: 'circle', color: 'ink', ink: '#000', paper: '#fff' },
  stipple: { scale: 1, seed: 1, density: 0, contrast: 1, grade: 0, speck: 'square', color: 'ink', ink: '#000', paper: '#fff' },
  dither: { scale: 1, matrix: 4, levels: 2, color: 'ink', ink: '#000', paper: '#fff' },
  duotone: { contrast: 1, density: 0, shadow: '#000', highlight: '#fff' },
  splatter: { min: 2, max: 24, seed: 1, density: 0, contrast: 1, warp: 0.3, vary: 0.5, color: 'ink', ink: '#000', paper: '#fff' },
  // shade()'s alone (INNER): the field as light, and grain as strong as it.
  light: { ink: '#000', paper: '#0000' },
  grain: { scale: 1, seed: 1, ink: '#000', paper: '#0000' },
  boil: { amount: 2, scale: 30, seed: 1, rough: 1 },
  // shade()'s alone too: printed inks over each other, as drops or smooth.
  crachis: { dot: 1.6, spread: 0.6, seed: 1, ink: '#000', paper: '#0000' },
  ink: { ink: '#000', paper: '#0000' },
};
const INNER = ['light', 'grain', 'crachis', 'ink'];
const COLOURS = { ink: 1, paper: 1, shadow: 1, highlight: 1 };
const CHOICES = { shape: ['circle', 'square', 'line'], speck: ['square', 'round'], color: ['ink', 'source'] };
// Each rule's text is for the development build's KN-100 message.
const RULES = {
  cell: [(v) => v > 0, __DEV__ && 'a number of px above 0'],
  scale: [(v) => v > 0, __DEV__ && 'a number of px above 0'],
  min: [(v) => v > 0, __DEV__ && 'a number of px above 0'],
  max: [(v) => v > 0, __DEV__ && 'a number of px above 0'],
  density: [(v) => v >= -1 && v <= 1, __DEV__ && 'a number from -1 to 1'],
  contrast: [(v) => v >= 0, __DEV__ && 'a number of 0 or more'],
  grade: [(v) => v >= 0 && v <= 1, __DEV__ && 'a number from 0 to 1'],
  rough: [(v) => v >= 1 && v <= 6 && v % 1 === 0, __DEV__ && 'a whole number from 1 to 6'],
  amount: [(v) => v >= 0, __DEV__ && 'a number of px, 0 or more'],
  warp: [(v) => v >= 0 && v <= 1, __DEV__ && 'a number from 0 to 1'],
  vary: [(v) => v >= 0 && v <= 1, __DEV__ && 'a number from 0 to 1'],
  seed: [(v) => v % 1 === 0, __DEV__ && 'a whole number'],
  matrix: [(v) => v === 2 || v === 4 || v === 8, __DEV__ && '2, 4 or 8'],
  levels: [(v) => v >= 2 && v <= 16 && v % 1 === 0, __DEV__ && 'a whole number from 2 to 16'],
  dot: [(v) => v > 0, __DEV__ && 'a number of px above 0'],
  spread: [(v) => v >= 0, __DEV__ && 'a number of 0 or more'],
};

// A crachis's drops for one ink, as the spray leaves them on the stone:
// discs at seeded places until they would cover the drawing 2.5 times over,
// each `dot` drawing px times 0.55 plus `spread` times 0.6 of an
// exponential draw across (at most 7 dots), each with a seeded value from
// 0 to 253. A pixel keeps the least value of the discs over it, 255 under
// none, written to `channel` of `out` (RGBA, the top row first). A pixel
// is then inked where its value is under the density's threshold: with
// discs dropped at random, the share of pixels under a value v is
// 1 - exp(-2.5 v / 255), so a density d inks 0.918 d of the drawing.
function drops(out, w, h, channel, dot, spread, seed) {
  let a = seed * 7919 + 13;
  const r = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  for (let i = channel; i < out.length; i += 4) out[i] = 255;
  for (let area = 0, target = 2.5 * w * h; area < target;) {
    const u = r();
    const rad = Math.max(0.75, Math.min(dot * 7, dot * (0.55 + spread * 0.6 * -Math.log(1 - u * 0.999))));
    const cx = r() * w, cy = r() * h, v = (r() * 254) | 0, r2 = rad * rad;
    const y1 = Math.min(h - 1, Math.ceil(cy + rad)), x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(w - 1, Math.ceil(cx + rad));
    for (let y = Math.max(0, Math.floor(cy - rad)); y <= y1; y++) {
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, i = (y * w + x) * 4 + channel;
        if (dx * dx + dy * dy <= r2 && out[i] > v) out[i] = v;
      }
    }
    area += Math.PI * r2;
  }
}

const VERT = '#version 300 es\nvoid main(){gl_Position=vec4(vec2(gl_VertexID&1,gl_VertexID>>1)*4.-1.,0,1);}';
// p is the pixel's place in CSS px from the canvas's top left; T reads the
// source there, L its brightness, H hashes three integers. In a halftone,
// e is one device pixel in cells; G is the circle's radius in cells, from
// sqrt(d/pi) to the cell's corner (0.7071) plus e at full darkness (and
// below zero at no darkness, so no edge pixel is drawn there), and the
// square and line grow by e at full darkness, so a black area prints solid.
// A circle past half a cell reaches into the three cells on the pixel's
// side of its own (never further: the corner is 0.7071 away), so a pixel
// takes the nearest edge of those four dots, and with color: source that
// dot's colour; else a dark dot beside lighter ones is cut square at its
// cell, a diamond on a turned grid. A square stipple speck is drawn by how
// much of the device pixel it covers, the pixel's own cell and the three
// on its side of it counted, so specks that touch join with no seam and a
// speck between device pixels has soft edges. X mixes two colours premultiplied, so
// an edge between ink and a transparent paper is not darkened. The source
// is uploaded premultiplied and T divides it out, so a sample between a
// colour and transparency is not darkened either. In a splatter, N sizes
// step from max to min by the ratio f; a size's cell is its drop's full
// size, a drop reaches at most half a cell from its centre, which sits in
// the middle 0.6 of its cell, so a pixel looks at its own cell and the
// eight around it in each size; sizes whose cells are under 2 device px
// are skipped,
// a drop is antialiased over a device pixel, drops over each other add up
// as alpha does, and the pixel takes the colour of the strongest. A drop
// is placed only where the field's alpha is a tenth or more: under that,
// the 8-bit colour stored with it is too coarse to be the ink's.
// Crachis and ink read J inks, N, each from its plane of the source: the
// planes are stacked, one under the other, so E reads ink i's density at p.
// A crachis inks a pixel where its drops' value, F's channel for the ink,
// is under the density's threshold (drops(), below), and overprinted inks
// multiply. Ink lets through the light each ink would at full density,
// raised to its density there, all in linear light: on white, exp of minus
// the densities times each ink's absorbance, -log of its linear colour.
const FRAG = `
precision highp float;
uniform sampler2D S,M,F;
uniform vec2 Z;
uniform float P,C,D,U,J;
uniform vec4 A,B,I,Q,N[4];
out vec4 o;
float E(vec2 p,int i){return texture(S,vec2(p.x/Z.x,(clamp(p.y,.5,Z.y-.5)/Z.y+float(i))*.25)).a;}
vec3 Y(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(.04045,c));}
vec3 O(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));}
vec4 T(vec2 p){vec4 c=texture(S,p/Z);return vec4(c.rgb/max(c.a,1e-5),c.a);}
float L(vec4 c){return mix(1.,dot(c.rgb,vec3(.2126,.7152,.0722)),c.a);}
float W(vec4 c){return D>.5?c.a:1.-L(c);}
float G(float d,float e){return d<=0.?-1.:d<.7854?sqrt(d/3.14159265):.5+(d-.7854)*(.2071+e)/.2146;}
uint H(uvec3 v){uint x=v.x*1597334677u^v.y*3812015801u^v.z*2654435769u;x^=x>>16;x*=2246822507u;x^=x>>13;x*=3266489909u;return x^x>>16;}
float R(vec2 i,int s){return float(H(uvec3(ivec3(ivec2(i),s))))/4294967296.;}
float V(vec2 x,int s){vec2 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(R(i,s),R(i+vec2(1,0),s),f.x),mix(R(i+vec2(0,1),s),R(i+1.,s),f.x),f.y);}
vec4 X(vec4 a,vec4 b,float k){vec4 m=mix(vec4(a.rgb*a.a,a.a),vec4(b.rgb*b.a,b.a),k);return vec4(m.rgb/max(m.a,1e-5),m.a);}
void main(){
vec2 p=vec2(gl_FragCoord.x,Z.y*P-gl_FragCoord.y)/P;
vec4 c=I;
#if K==0
float a=radians(A.y),e=1./(A.x*P);
mat2 R=mat2(cos(a),sin(a),-sin(a),cos(a));
vec2 q=p*R/A.x,n=floor(q)+.5,f=q-n;
vec4 t=T(R*n*A.x);
float d=clamp(W(t)+A.z,0.,1.),r;
if(A.w<.5){
r=G(d,e)-length(f);
vec2 s=sign(f);
for(int i=1;i<4;i++){
vec2 o=vec2(i&1,i>>1)*s;
vec4 u=T(R*(n+o)*A.x);
float v=G(clamp(W(u)+A.z,0.,1.),e)-length(f-o);
if(v>r){r=v;t=u;}
}
}else r=d<=0.?-1.:A.w<1.5?sqrt(d)*.5+d*e-max(abs(f.x),abs(f.y)):d*(.5+e)-abs(f.y);
if(C>.5)c=vec4(t.rgb,I.a);
c=X(Q,c,clamp(r/e+.5,0.,1.));
#elif K==1
vec2 q=p/A.x,g=floor(q),f=q-g-.5;
float e=1./(A.x*P),k=0.;
vec4 t=T((g+.5)*A.x);
if(B.y>.5){
float v=clamp((W(t)-.5)*A.w+.5+A.z,0.,1.);
k=float(H(uvec3(ivec3(ivec2(g),int(A.y)))))/4294967296.<v?clamp((mix(1.,sqrt(v),B.x)*.5642-length(f))/e+.5,0.,1.):0.;
}else{
vec2 d=vec2(f.x<0.?-1.:1.,f.y<0.?-1.:1.);
float b=0.;
for(int i=0;i<4;i++){
vec2 n=g+vec2(i&1,i>>1)*d;
vec4 u=T((n+.5)*A.x);
float v=clamp((W(u)-.5)*A.w+.5+A.z,0.,1.);
if(float(H(uvec3(ivec3(ivec2(n),int(A.y)))))/4294967296.>=v)continue;
float h=mix(1.,sqrt(v),B.x)*.5;
vec2 w=max(min(q+e*.5,n+.5+h)-max(q-e*.5,n+.5-h),0.);
float a=w.x*w.y/(e*e);
k+=a;
if(a>b){b=a;t=u;}
}
k=min(k,1.);
}
if(C>.5)c=vec4(t.rgb,I.a);
c=X(Q,c,k);
#elif K==2
ivec2 g=ivec2(floor(p/A.x));
int n=int(A.y),x=g.x&(n-1),y=g.y&(n-1),m=0;
for(int b=1,w=n*n/4;b<n;b<<=1,w>>=2)m+=(((x^y)&b)!=0?2*w:0)+((y&b)!=0?w:0);
vec4 t=T((vec2(g)+.5)*A.x);
float q=(1.-W(t))*(A.z-1.);
c=X(C>.5?vec4(t.rgb,I.a):I,Q,(floor(q)+step((float(m)+.5)/float(n*n),fract(q)))/(A.z-1.));
#elif K==3
c=X(I,Q,clamp((L(T(p))-.5)*A.x+.5-A.y,0.,1.));
#elif K==5
c=vec4(T(p).rgb,W(T(p))*I.a);
#elif K==6
c=vec4(vec3(R(floor(p/A.x),int(A.y))),W(T(p))*I.a);
#elif K==7
int s=int(A.z);
vec2 q=p/A.y,d=vec2(0);
float a=.5,m=0.,f=1.;
for(int i=0;i<6;i++){if(i>=int(A.w))break;d+=a*vec2(V(q*f,s+i*13),V(q*f+17.3,s+i*13+5));m+=a;a*=.5;f*=2.;}
c=T(p+tanh((d/m-.5)*3.5)*A.x);
#elif K==8
vec4 f=texelFetch(F,ivec2(gl_FragCoord.x,float(textureSize(F,0).y)-gl_FragCoord.y),0)*255.;
vec3 m=vec3(1);
float k=0.;
for(int i=0;i<4;i++){if(float(i)>=J)break;float d=min(E(p,i),1.);if(d>0.&&f[i]<min(255.,-log(1.-d*.918)*102.)){m*=N[i].rgb;k=1.;}}
c=vec4(m,k*I.a);
#elif K==9
vec3 s=vec3(0);
for(int i=0;i<4;i++){if(float(i)>=J)break;s-=min(E(p,i),1.)*log(max(Y(N[i].rgb),vec3(1e-4)));}
c=vec4(O(exp(-s)),I.a);
#else
int s=int(A.z);
vec4 t=T(p);
float N=min(6.,floor(log(A.y/A.x)/log(1.9)+.5)+1.),f=N>1.?pow(A.x/A.y,1./(N-1.)):1.,k=0.,b=0.,z=A.y;
for(int i=0;i<6;i++){
if(float(i)>=N)break;
if(z*P>=2.){
int h=s+i*13;
vec2 q=p/z,g=floor(q);
float e=1./(z*P),y=1.+1.5*(1.-float(i)/max(N-1.,1.));
for(int j=0;j<9;j++){
vec2 n=g+vec2(j%3-1,j/3-1),m=n+.2+.6*vec2(R(n,h),R(n,h+1));
vec4 u=T(m*z);
float v=clamp((W(u)-.5)*B.x+.5+A.w,0.,1.);
if(u.a<.1||v<=0.||R(n,h+2)>=pow(v,y))continue;
float w=R(n,h+3),r=(.25+.25*w*w)*mix(.7,1.,v),d=length(q-m);
d+=B.y*r*(V((q-m)/r*1.5+n*7.,h+4)-.5)*1.2;
float a=clamp((r-d)/e+.5,0.,1.)*(1.-B.z*R(n,h+5));
if(a>b){b=a;t=u;}
k+=a*(1.-k);
}
}
z*=f;
}
if(C>.5)c=vec4(t.rgb,I.a);
c=X(Q,c,k);
#endif
if(U>.5)c.a*=texelFetch(M,ivec2(gl_FragCoord.x,float(textureSize(M,0).y)-gl_FragCoord.y),0).a;
o=vec4(c.rgb*c.a,c.a);
}`;

const what = (x) => (x && x.localName ? 'a <' + x.localName + '>' : show(x));

// Throws KN-100 for a parameter the kind does not take or a bad value. `pre`
// starts the call, 'effect(canvas, ' or 'set(', and the message's where
// names the parameter in it, as in effect(canvas, { cell }).
function check(kind, params, pre) {
  if (!params || typeof params !== 'object') throw fail(CODES.BAD_CALL, pre + 'params)', __DEV__ && 'the parameters are an object, not ' + show(params));
  const table = KINDS[kind];
  for (const k in params) {
    if (!own(table, k)) throw fail(CODES.BAD_CALL, pre + '{ ' + k + ' })', __DEV__ &&"'" + k + "' is not a parameter of " + kind + '; its parameters are ' + Object.keys(table).join(', '));
    const rule = CHOICES[k] ? [(x) => CHOICES[k].includes(x), __DEV__ && CHOICES[k].join(', ').replace(/, (\w+)$/, ' or $1')]
      : COLOURS[k] ? [parseColor, __DEV__ && 'a colour, #rgb, #rrggbb or rgb()']
        : [(x) => typeof x === 'number' && Number.isFinite(x) && (!RULES[k] || RULES[k][0](x)), __DEV__ && (RULES[k] ? RULES[k][1] : 'a number')];
    if (!rule[0](params[k])) throw fail(CODES.BAD_CALL, pre + '{ ' + k + ' })', __DEV__ &&k + ' is ' + rule[1] + ', not ' + show(params[k]));
  }
}

// A splatter's smallest drop is no larger than its largest: `v` is the
// effect's values with the call's merged in.
function sizes(v, pre) {
  if (v.min > v.max) throw fail(CODES.BAD_CALL, pre + '{ min, max })', __DEV__ && 'min is the smallest drop and max the largest, so min is at most max, not ' + v.min + ' and ' + v.max);
}

// The steps a boil has taken at local time t: none before `delay`, then one
// every 1 / fps s from it (effect(), shade(), blur() and boil()).
// A kind's default for a parameter, for shade()'s set() to tell a default it
// was never given from a change.
export const defaultOf = (kind, k) => (KINDS[kind] ? KINDS[kind][k] : undefined);

export const boilStep =(t, fps, delay) => (fps > 0 && t >= delay ? Math.floor((t - delay) * fps + 1e-9) : 0);

// effect()'s own timing, out of `p`: fps (new seeds a second, for a kind
// with a seed) and delay (s before the boil starts). Returns the rest.
function timing(kind, p, into, pre) {
  if (!p || typeof p !== 'object') return p;
  const rest = Object.assign({}, p);
  for (const k of ['fps', 'delay']) {
    if (!own(rest, k)) continue;
    const v = rest[k];
    if (!own(KINDS[kind], 'seed')) throw fail(CODES.BAD_CALL, pre + '{ ' + k + ' })', __DEV__ && k + ' is for the kinds with a seed (stipple, splatter and boil), not ' + kind);
    if (!(typeof v === 'number' && Number.isFinite(v) && v >= 0)) throw fail(CODES.BAD_CALL, pre + '{ ' + k + ' })', __DEV__ && k + (k === 'fps' ? ' is new seeds a second' : ' is seconds') + ', 0 or more, not ' + show(v));
    into[k] = v;
    delete rest[k];
  }
  return rest;
}

export function createEffects(wf, clock, scenes) {
  const live = new Set();
  const onCanvas = new WeakMap();   // canvas -> the kind of its live effect

  // The scene an effect was made with is removed: the effect is disposed
  // with it, wherever its canvas is.
  wf.hook('component:beforeDestroy', (inst) => {
    for (const fx of live) if (fx.el && fx.el === inst.element) fx.dispose();
  });

  // `inner` is from shade() only: { alpha } reads the darkness from the
  // source's alpha, so its colour can be the ink's; { box } sizes the
  // drawing from the CSS box alone, past any transform shade() puts on the
  // canvas; { prepare } runs before each draw, to paint the source; and
  // { mask(w, h, P) } returns { canvas, id }, a canvas of the drawing's
  // size whose alpha multiplies the drawing's, sent again when id changes,
  // or null for none.
  function effect(canvas, opts, inner) {
    inner = inner || {};
    if (!canvas || canvas.localName !== 'canvas') throw fail(CODES.BAD_CALL, 'effect(canvas)', __DEV__ && 'canvas is a <canvas> element, not ' + what(canvas));
    if (!opts || typeof opts !== 'object') throw fail(CODES.BAD_CALL, 'effect(…, options)', __DEV__ && 'options is { scene, source, kind, ...parameters }, not ' + show(opts));
    const { source, kind } = opts;
    // shade() hands its own scene in `inner`.
    const el = own(inner, 'scene') ? inner.scene : scenes.sceneOf(opts.scene, 'effect(canvas, ');
    if (!source || !['img', 'video', 'canvas'].includes(source.localName)) throw fail(CODES.BAD_CALL, 'effect(canvas, { source })', __DEV__ && 'source is an <img>, <video> or <canvas> element, not ' + what(source) + '; for HTML, use an SVG filter');
    if (!own(KINDS, kind) || (INNER.includes(kind) && !inner.alpha)) throw fail(CODES.BAD_CALL, 'effect(canvas, { kind })', __DEV__ && 'kind is one of ' + Object.keys(KINDS).filter((k) => !INNER.includes(k)).join(', ') + ', not ' + show(kind));
    const time = { fps: 0, delay: 0 };
    const params = timing(kind, opts, time, 'effect(canvas, ');
    delete params.source;
    delete params.kind;
    delete params.scene;
    check(kind, params, 'effect(canvas, ');
    // One live effect a canvas: a second would share its context, and
    // disposing either would lose it for both.
    if (onCanvas.has(canvas)) throw fail(CODES.BAD_CALL, 'effect(canvas)', __DEV__ && 'the canvas already has a live ' + onCanvas.get(canvas) + ' effect; dispose() it first, or give this effect a canvas of its own');
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
    if (!gl || gl.isContextLost()) throw fail(CODES.BAD_CALL, 'effect(canvas): WebGL 2', __DEV__ &&'the canvas has no WebGL 2 context; a canvas with a 2D or WebGL 1 context, or whose effect was disposed, cannot have one, and a browser can have WebGL 2 turned off');
    if (__DEV__) openedContext(gl);
    const tag = source.localName;
    const values = Object.assign({}, KINDS[kind], params);
    sizes(values, 'effect(canvas, ');
    let prog, tex, mtex, masked, at, frame, key;
    // A crachis's drops: the texture, its pixels, what each channel was made
    // for, and what the texture was last sent for.
    let ftex, fdata = null, fmade = [], sent = null;
    let shown = false;   // drawn while on the page, so leaving it disposes the effect
    let bad = null;      // the source WebGL could not read (KN-204), skipped until it changes

    // The program, the texture and the uniforms, made again when a lost
    // context is restored.
    function setup() {
      prog = gl.createProgram();
      for (const [type, text] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, '#version 300 es\n#define K ' + Object.keys(KINDS).indexOf(kind) + FRAG]]) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, text);
        gl.compileShader(sh);
        gl.attachShader(prog, sh);
      }
      gl.linkProgram(prog);
      if (__DEV__ && !gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('effect(): ' + gl.getProgramInfoLog(prog));
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      // No mipmaps, and the edge held past the edge (magnification is linear already).
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      // Premultiplied, so a sample between a colour and transparency is the
      // colour at part alpha, not darkened by the transparent pixel's black.
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      // shade()'s mask, one texel a drawing pixel, on the second unit.
      mtex = null;
      if (inner.mask) {
        mtex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, mtex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.activeTexture(gl.TEXTURE0);
      }
      // A crachis's drops, one ink a channel, on the third unit.
      ftex = null;
      if (kind === 'crachis') {
        ftex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, ftex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.activeTexture(gl.TEXTURE0);
      }
      at = {};
      for (const u of 'ZPCDABIQMUFJN') at[u] = gl.getUniformLocation(prog, u);
      frame = key = masked = sent = null;
    }
    setup();

    const fx = {
      source,
      el,   // the element of the scene it was made with, or null
      dispose: () => handle.dispose(),
      draw() {
        if (!canvas.isConnected) { if (shown) handle.dispose(); return; }
        shown = true;
        if (gl.isContextLost()) return;
        const cw = canvas.clientWidth, ch = canvas.clientHeight;
        // A canvas with no box (display: none, data-hidden) draws nothing.
        if (!cw || !ch) return;
        // shade() paints its source here, and says whether it changed.
        const painted = inner.prepare ? inner.prepare(cw, ch) : true;
        let w = cw, h = ch;
        if (!canvas.closest('[data-kinetic-render]')) {
          const r = canvas.getBoundingClientRect(), dpr = self.devicePixelRatio || 1;
          w = Math.round((inner.box ? cw : Math.min(r.width, cw)) * dpr);
          h = Math.round((inner.box ? ch : Math.min(r.height, ch)) * dpr);
        }
        const id = tag === 'canvas' ? source : source.currentSrc || source.src;
        const now = tag === 'img' ? (source.complete && source.naturalWidth ? id : null)
          : tag === 'video' ? (source.readyState >= 2 ? id + '#' + source.currentTime : null)
            : source.width && source.height ? (painted || !frame ? {} : frame) : null;
        // shade()'s mask at the drawing's size: { canvas, id }, or null.
        const mk = inner.mask && w && h ? inner.mask(w, h, w / cw) : null;
        // A boiling effect's seed, moved on by the steps at its scene's
        // local time, or the composition time without one.
        let cur = values;
        if (time.fps > 0) {
          const t = clock.now();
          cur = Object.assign({}, values, { seed: values.seed + boilStep(fx.el ? scenes.localOf(fx.el, t) : t, time.fps, time.delay) });
        }
        const k = w + ' ' + h + ' ' + JSON.stringify(cur) + (mk ? mk.id : '');
        if (!w || !h || now === null || id === bad || (now === frame && k === key)) return;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          // A canvas with no CSS size of its own takes it from width and
          // height, which would grow it again on every draw.
          if (canvas.clientWidth !== cw) canvas.style.width = cw + 'px';
          if (canvas.clientHeight !== ch) canvas.style.height = ch + 'px';
        }
        gl.useProgram(prog);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        if (now !== frame) {
          try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
          } catch (e) {
            if (e && e.name === 'SecurityError') {
              bad = id;
              throw fail(CODES.FOREIGN_MEDIA, 'effect(): the source ' + clipName(source) + (tag === 'canvas' ? '' : ' (' + id + ')'),
                __DEV__ && (tag === 'canvas' ? 'it has an image from another origin on it, drawn without CORS' : 'it is from another origin without CORS')
                + ', so WebGL cannot read it; give ' + (tag === 'canvas' ? 'that image' : 'it') + ' crossorigin="anonymous", with Access-Control-Allow-Origin from its server');
            }
            throw e;
          }
        }
        const a = [], cols = [];
        let mode = 0;
        for (const n in KINDS[kind]) {
          const v = cur[n];
          if (n === 'color') mode = v === 'source' ? 1 : 0;
          else if (COLOURS[n]) { const c = parseColor(v); cols.push([c[0] / 255, c[1] / 255, c[2] / 255, c[3]]); }
          else a.push(CHOICES[n] ? CHOICES[n].indexOf(v) : v);
        }
        while (a.length < 8) a.push(0);
        // P is drawing pixels per CSS px, Z the canvas in CSS px.
        const P = w / cw;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(at.Z, cw, h / P);
        gl.uniform1f(at.P, P);
        gl.uniform1f(at.C, mode);
        gl.uniform1f(at.D, inner.alpha ? 1 : 0);
        gl.uniform4fv(at.A, a.slice(0, 4));
        gl.uniform4fv(at.B, a.slice(4, 8));
        // A kind with no colours (boil) passes none.
        gl.uniform4fv(at.I, cols[0] || [0, 0, 0, 1]);
        gl.uniform4fv(at.Q, cols[1] || [0, 0, 0, 0]);
        if (inner.inks) {
          const list = inner.inks(), n = new Float32Array(16);
          list.forEach((c, i) => n.set([c[0], c[1], c[2], 1], i * 4));
          gl.uniform4fv(at.N, n);
          gl.uniform1f(at.J, list.length);
          if (ftex) {
            // Each ink's drops, made when the drawing's size, the dot, the
            // spread or the seed change, sent when any channel was made.
            const made = w + ' ' + h + ' ' + cur.dot * P + ' ' + cur.spread + ' ' + cur.seed;
            if (!fdata || fdata.length !== w * h * 4) { fdata = new Uint8Array(w * h * 4); fmade = []; }
            for (let i = 0; i < list.length; i++) {
              if (fmade[i] !== made) { drops(fdata, w, h, i, cur.dot * P, cur.spread, cur.seed * 4 + i); fmade[i] = made; }
            }
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, ftex);
            const id = fmade.join('|');
            if (id !== sent) {
              gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, fdata);
              gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
              sent = id;
            }
            gl.uniform1i(at.F, 2);
            gl.activeTexture(gl.TEXTURE0);
          }
        }
        gl.uniform1f(at.U, mk ? 1 : 0);
        if (mk) {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, mtex);
          if (mk.id !== masked) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mk.canvas);
            masked = mk.id;
          }
          gl.uniform1i(at.M, 1);
          gl.activeTexture(gl.TEXTURE0);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        frame = now;
        key = k;
      },
    };
    const lost = (e) => {
      e.preventDefault();   // so the browser may restore it
      if (__DEV__) {
        warn(CODES.CONTEXT_LOST, 'the WebGL context of ' + clipName(canvas) + "'s " + kind + ' effect was lost, so it draws nothing until the browser restores it; a browser drops the oldest context when a page holds too many',
          'Give each effect { scene: this }, which disposes it with its scene, or call dispose() on those you no longer draw, and keep the number of effect canvases low.');
      }
    };
    const restored = () => setup();
    // An <img> that loads while the clock is paused is drawn at once.
    const loaded = () => { try { fx.draw(); } catch (e) { console.error(e); } };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    if (tag === 'img') source.addEventListener('load', loaded);
    live.add(fx);
    onCanvas.set(canvas, kind);
    const handle = {
      set(p) {
        if (p && typeof p === 'object' && own(p, 'scene')) throw fail(CODES.BAD_CALL, 'set({ scene })', __DEV__ && 'scene is given when the effect is made');
        const when = {};
        p = timing(kind, p, when, 'set(');
        check(kind, p, 'set(');
        sizes(Object.assign({}, values, p), 'set(');
        Object.assign(values, p);
        Object.assign(time, when);
        return handle;
      },
      dispose() {
        if (!live.delete(fx)) return;
        onCanvas.delete(canvas);
        canvas.removeEventListener('webglcontextlost', lost);
        canvas.removeEventListener('webglcontextrestored', restored);
        source.removeEventListener('load', loaded);
        gl.deleteTexture(tex);
        if (ftex) gl.deleteTexture(ftex);
        fdata = null;
        gl.deleteProgram(prog);
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      },
    };
    return handle;
  }

  // Every live effect, once a seek has landed. Each is drawn even when one
  // throws, and the first exception then rejects the seek.
  function draw() {
    let failed = null;
    for (const fx of live) {
      try { fx.draw(); } catch (e) { if (!failed) failed = e; }
    }
    if (failed) throw failed;
  }
  clock.onLanded(draw);

  return {
    effect: (canvas, opts) => effect(canvas, opts),
    // shade()'s effect, with its inner options (above).
    inner: effect,
    draw,
    // At readiness, check() and render(): each <img> source decoded.
    load: () => Promise.all(Array.from(live, (fx) => fx.source.localName === 'img' && fx.source.decode().catch(() => {}))),
  };
}
