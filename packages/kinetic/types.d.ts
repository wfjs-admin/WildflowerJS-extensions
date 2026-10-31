/**
 * @wildflowerjs/kinetic TypeScript definitions
 *
 * Kinetic: a WildflowerJS page as a video, with time-driven scenes,
 * HyperFrames-compatible. In development.
 *
 * The built files are IIFEs that add `wildflower.kinetic` and export nothing,
 * so this file declares types only: import them with `import type`, or
 * reference `types.global.d.ts` to type `wildflower.kinetic`.
 *
 * @license MIT
 */

/** The `kinetic` store: the composition clock. Read it as `$kinetic.time`. */
export interface KineticStore {
  /** Composition seconds. */
  readonly time: number;
  /** Math.round(time * fps); in a render with a shutter, the number of the frame its samples belong to. */
  readonly frame: number;
  /** Frames per second: a render's own, else the root's data-fps, else config({ fps }), else 30. */
  readonly fps: number;
  /** The root's data-duration in seconds, or the runtime player's duration; 0 when unknown. */
  readonly duration: number;
  /**
   * True while the clock plays: the HyperFrames player's state when a runtime
   * is on the page (read at each hf-seek, and every 200 ms while it plays),
   * else the standalone clock's.
   */
  readonly playing: boolean;
  /**
   * How many times the audio clips' level tables have changed; 0 on a page
   * with no audio clip. level() and spectrum() read it, so a computed that
   * calls them runs again when the tables change.
   */
  readonly levels: number;
  /**
   * The shutter angle, in degrees, of the render with a shutter that is
   * running; 0 at any other time. smear() reads it, so a computed that calls
   * smear() runs again when such a render starts and ends.
   */
  readonly shutter: number;
  /**
   * The mode in force: 'video' with the HyperFrames runtime on the page or a
   * render capturing, while check() or render() runs, with config({ mode:
   * 'video' }), and under 'auto' with the preview bar up; 'interactive' otherwise.
   */
  readonly mode: 'interactive' | 'video';
  /** The id of the step whose range holds `time`; '' before the first step, past the last one's end, or with none. Both modes. */
  readonly step: string;
  /** That step's index from 0, or -1. */
  readonly stepIndex: number;
  /** How many steps the composition has. */
  readonly stepCount: number;
  /** The step's range in composition seconds: from its start to the next step's start (the last step's own end, or the composition's). */
  readonly stepStart: number;
  readonly stepLength: number;
  /** Interactive mode: true while the clock holds at the step's wait point, once the hold's seek has settled, and at the end of a step that played on after its `until`. Always false in video mode. */
  readonly waiting: boolean;
  /**
   * What a Next button binds to. Interactive mode: false while the current
   * step's `until` path is falsy, true otherwise, whether the step plays or
   * holds. Always true in video mode.
   */
  readonly canAdvance: boolean;
}

/** A step script's track: interpolate() over the step's seconds, for numbers, colours and text with numbers in it. */
export interface ScriptTrack extends InterpolateOptions {
  at: number[];
  to: number[] | string[];
}

/** A step script's settings: each value held from its time (seconds from the step's start) to the next. */
export interface ScriptSettings {
  at: number[];
  /** Strings, numbers, booleans or null; anything else is KN-100. */
  set: Array<string | number | boolean | null>;
}

/** step(id, definition): what a step's markup cannot carry. */
export interface StepDefinition {
  /**
   * Interactive mode: the seconds from the step's start at which it holds. Default:
   * the shorter of the step's range and its own clip's duration; clamped to
   * the range (KN-157 in development). false plays the step and goes on to
   * the next, and is KN-100 with `until`.
   */
  wait?: number | false;
  /**
   * Interactive mode: a store path ('quiz.answered'); the step holds until it
   * is truthy, then plays the rest of its range from the hold and holds on
   * its last frame for Next; it never enters the next step by itself. A hold
   * at the range's end stays where it is. next() and canAdvance wait for it.
   */
  until?: string;
  /** Interactive mode: store paths and the values written to them as the step is entered. */
  entry?: Record<string, unknown>;
  /**
   * Video mode: store paths and their entries, written on every seek. A
   * path's value at a time comes from the scripts alone. A path whose store
   * does not exist, or that names a computed, fails readiness with KN-100.
   */
  script?: Record<string, ScriptTrack | ScriptSettings>;
}

/** The `kinetic:step` event's detail, dispatched on document as interactive mode enters a step, once its seek has settled. */
export interface StepEventDetail {
  step: string;
  index: number;
}

/** A `follow` entry: a store path, or the path and a spring. */
export type FollowEntry = string | {
  target: string;
  /** 'spring' or { spring }; { spring: { duration: 0.4 } } by default. Another ease, overshootClamping and no damping are KN-100. */
  ease?: 'spring' | { spring: Omit<SpringOptions, 'overshootClamping' | 'from' | 'to'> };
};

/** The computeds every scene gets. */
export interface SceneContext {
  /** Composition seconds. */
  readonly time: number;
  /**
   * Seconds since the scene's clip started: data-start, with the host
   * composition's offset, plus data-playback-start. Held at the clip's edges:
   * 0 before it starts and the clip's duration after it ends, where the scene
   * is hidden, so its computeds and seek(local) stop running there.
   */
  readonly local: number;
  /** Math.round(local * fps): the frame number within the clip; in a render with a shutter, that of the frame its samples belong to. */
  readonly clipFrame: number;
  /** The clock's frames per second: a render's own, else the root's data-fps, else config({ fps }), else 30. */
  readonly fps: number;
  /** 0 to 1 from the clip's start to its last captured frame, duration - 1/fps; 0 when it has no duration. */
  readonly progress: number;
  /** Seconds until the clip ends; Infinity when it has no end. */
  readonly remaining: number;
  /** 0 to 1 over the first `edges.enter` seconds; 1 without edges. */
  readonly enter: number;
  /** 0 to 1 over the `edges.exit` seconds that end on the clip's last captured frame, duration - 1/fps; 0 without edges. */
  readonly exit: number;
  /** enter * (1 - exit): 0 at both ends of the clip, 1 between; 1 without edges. */
  readonly presence: number;
  /** The composition variables HyperFrames resolved for this scene's own composition. */
  readonly vars: Record<string, unknown>;
  /** The scene's `inputs`, read from `vars`, coerced and validated before init(). */
  readonly inputs: Record<string, unknown>;
}

export type InputType = StringConstructor | NumberConstructor | BooleanConstructor;

export interface InputDeclaration {
  type?: InputType;
  required?: boolean;
  default?: unknown;
  /** Returns false, or throws, to reject the value. */
  validator?: (value: any) => boolean;
}

/**
 * An ease: a CSS name (`linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`,
 * `cubic-bezier(x1, y1, x2, y2)`, `steps(n)`, `steps(n, start)`), a GSAP name
 * (`power1`..`power4`, `sine`, `expo`, `circ`, `back`, `elastic`, `bounce`,
 * each with `.in`, `.out` or `.inOut`; a bare name is `.out`), `'smooth'`
 * (the smoothstep; as the one ease of a number track with three or more
 * keys, one curve through them all, the velocity continuous at each key
 * between and zero at the ends), `'spring'` or
 * `{ spring: {...} }` (`{ spring: {} }` for the defaults), or a function of
 * progress. A spring's options are checked when the ease is made (KN-121).
 */
export type Ease = string | ((p: number) => number) | { spring: SpringOptions };

/**
 * Outside the keyframes: 'clamp' holds the end values, 'extend' continues the
 * end segments, 'identity' returns t itself, so it is for number tracks only
 * (KN-120 on a color or text track), 'wrap' starts the keyframes again from
 * the first, and 'mirror' plays them backward and forward in turn. An
 * infinite t on an 'extend', 'wrap' or 'mirror' side gives that side's end
 * value.
 */
export type Extrapolate = 'clamp' | 'extend' | 'identity' | 'wrap' | 'mirror';

export interface InterpolateOptions {
  /**
   * Applied to every segment, or an array with one ease per segment (one
   * fewer than the keyframes; KN-121 otherwise). A spring reads the seconds elapsed in its
   * segment, and on the last segment it runs on past the last key.
   */
  ease?: Ease | Ease[];
  /** Both sides at once; 'clamp' is the default. */
  extrapolate?: Extrapolate;
  extrapolateLeft?: Extrapolate;
  extrapolateRight?: Extrapolate;
  /** true for whole numbers, or a whole number of decimals (KN-120 otherwise). */
  round?: boolean | number;
  /**
   * How colors mix, in a color track or in a text track: 'rgb' (the default)
   * per channel, or 'oklch', with lightness and chroma mixed linearly and the
   * hue the shorter way round, so the midpoint of blue and yellow is a teal
   * where 'rgb' gives grey. A grey takes the other color's hue, and a mix
   * outside sRGB loses chroma until it fits. KN-120 for another value.
   */
  space?: 'rgb' | 'oklch';
}

/**
 * A keyframe track: values at times, in the clip's seconds. Values are all
 * numbers, all colors (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba()), or all text
 * with numbers and colors in it, such as 'inset(0% 40% 0% 0%)', every
 * keyframe the same text with only its numbers and colors changing (KN-120
 * otherwise). An rgb() channel above 255 is read as 255 and an alpha above 1
 * as 1, as CSS reads them. A number in text is written with at most four
 * decimals. SVG path data, as a whole value or inside path("…"), is read by
 * the path grammar: a number glued to a letter or another number is a
 * number, an arc's two flags are text, and the path is written back with a
 * space between its numbers. Paths with different commands are KN-120;
 * matchPaths() makes them the same.
 */
export interface Track extends InterpolateOptions {
  at: number[];
  to: number[] | string[];
  /**
   * Appended to a number: 'px', '%', 'deg'. The transform keys and blur have
   * their own defaults. A length property (width, top, fontSize, ...) needs
   * one; development builds warn without it (KN-122). A color or text track
   * takes none.
   */
  unit?: string;
}

/**
 * Tracks by style property. perspective, translateX and translateY (one
 * translate()), translateZ, rotateX, rotateY, rotate, skewX, skewY, scale,
 * scaleX and scaleY combine into `transform` in that order, and take
 * numbers; blur becomes `filter: blur()`, in px. A `filter` track beside
 * `blur`, or a `transform` track beside any of the transform keys, is
 * KN-120, since one would overwrite the other. A key may also be a finite
 * number, that key's value at every time with its default unit; a number
 * on a length outside the transform gets no unit (KN-122 in development).
 */
export type Tracks = Record<string, Track | number>;

export interface FocusOptions {
  /** The depth distance over which the blur grows; the falloff is max * (1 - 1 / (1 + (d / range)^2)). Default 200. */
  range?: number;
  /** The blur in px far from the plane: a finite number, 0 or more. Default 12. */
  max?: number;
  /** Quantise the result to this many levels (2 or more), for a band of elements that share one filter. */
  steps?: number;
  /** The depth of field: everything within this distance either side of the plane is sharp, and d counts from the band's edges. Default 0. */
  depth?: number;
}

/**
 * A track for a camera key: numbers only, and no unit, since the units are
 * fixed (KN-120 for a unit or for text or colour values).
 */
export interface CameraTrack extends InterpolateOptions {
  at: number[];
  to: number[];
}

/**
 * A camera's position: each key a CameraTrack (read at t, as
 * interpolate(t, track) reads a track) or a number that does not change; a key left out or undefined is
 * at rest, and so is every key when tracks is not an object. The directions
 * are the camera's, so the scene moves the other way on screen. x, y and z
 * run along the scene's axes and the turns are about the camera's own
 * position, as on a dolly track: a dolly after a pan still goes straight
 * into the scene. Any other key is KN-100; a malformed track, a track of
 * text or colours, a track with a unit, or a value that is neither a finite
 * number nor a track is KN-120.
 */
export interface CameraTracks {
  /** Truck, px: positive moves the camera right, along the scene's x axis. At rest 0. */
  x?: number | CameraTrack;
  /** Crane, px: positive moves the camera down, as y runs in CSS, along the scene's y axis. At rest 0. */
  y?: number | CameraTrack;
  /** Dolly, px: positive moves the camera into the scene, along the scene's z axis. At rest 0. */
  z?: number | CameraTrack;
  /** Degrees: the camera turns right about the vertical through its own position. At rest 0. */
  pan?: number | CameraTrack;
  /** Degrees: the camera turns up about its horizontal axis. At rest 0. */
  tilt?: number | CameraTrack;
  /** Degrees: the camera turns clockwise about its line of sight. At rest 0. */
  roll?: number | CameraTrack;
  /** The lens: the picture scaled about its centre, no change in parallax. 0.0001 or more (KN-100 otherwise). At rest 1. */
  zoom?: number | CameraTrack;
}

export interface CameraOptions {
  /** The distance from the eye to the z = 0 plane, px: a finite number, 0.0001 or more. Default 1000. depth() takes the same value. */
  perspective?: number;
  /** One shake() result or an array of them, added to x, y and roll; null or undefined for none (KN-100 for anything else). */
  shake?: Shake | Shake[] | null;
}

/** The style camera() gives the world, the element that holds the layers. */
export interface CameraStyle {
  /** perspective(P) scale(zoom) translateZ(P) rotateZ(-roll) rotateX(tilt) rotateY(pan) translateZ(-P) translate3d(-x, -y, z) */
  transform: string;
  transformStyle: 'preserve-3d';
  transformOrigin: '50% 50%';
}

export interface DepthOptions {
  /** The camera's perspective, px. Default 1000. */
  perspective?: number;
  /** false leaves out the scale, so a layer set back looks smaller. Default true. */
  fill?: boolean;
}

/** handheld: 0.7 Hz, 16 / 11 px, 1.1 deg. rumble: 7 Hz, 5.4 / 7.2 px, 0.36 deg. impact: 11 Hz, 61 / 47 px, 4.3 deg, 0 before t = 0, then times e^(-t / 0.32). */
export type ShakeProfile = 'handheld' | 'rumble' | 'impact';

export interface ShakeOptions {
  /** A number or a string, as noise() takes. Default 1. */
  seed?: number | string;
  /** Scales all three offsets: a finite number, 0 or more. Default 1. */
  amount?: number;
  /** Scales the frequency: a finite number above 0. Default 1. */
  speed?: number;
}

/** Camera offsets: x and y in px, roll in degrees. */
export interface Shake {
  x: number;
  y: number;
  roll: number;
}

export interface WiggleOptions {
  /** Wiggles a second: a new value every 1 / frequency seconds. A finite number above 0. Default 1. */
  frequency?: number;
  /** The most it moves either way: a finite number, 0 or more. Default 1. */
  amplitude?: number;
  /** A number or a string, as noise() takes. Default 1. */
  seed?: number | string;
}

export interface SmearOptions {
  /** The number of copies, N: a whole number from 1 to 32. Default 8. */
  samples?: number;
  /** The shutter angle in degrees, above 0 and up to 360: 360 spreads the copies over the whole frame. Default 180. */
  angle?: number;
  /** The frames per second the angle is measured in: a finite number above 0. Default the clock store's fps. */
  fps?: number;
}

/**
 * One copy for a data-list (data-key="key"): the style at
 * t + (key / N) * (angle / 360) / fps, with opacity divided by N and
 * mixBlendMode 'plus-lighter'; with one copy, the style at t as it is.
 */
export interface SmearRow {
  key: number;
  style: Record<string, string | number>;
}

/** A copy for trails('ghosts'): k from 1, styled at t. */
export interface GhostRow {
  key: number;
  k: number;
  t: number;
  style: Record<string, string | number>;
}

/** A mark for trails('dots'): distribute('path')'s fields and whether the mover has passed it. */
export interface TrailDot {
  i: number;
  key: number;
  x: number;
  y: number;
  /** The direction of travel in degrees, 0 right and 90 down. */
  heading: number;
  u: number;
  state: 'past' | 'future';
}

/**
 * A render's shutter: an angle in degrees (above 0, up to 360; default 180)
 * and the seeks averaged for each frame (a whole number from 2 to 64;
 * default 8).
 */
export interface ShutterOptions {
  angle?: number;
  samples?: number;
}

export interface MatchPathsOptions {
  /** The fewest segments each subpath gets: a whole number, 1 or more. Default 8, the fewest that keeps a square to a circle from twisting. */
  segments?: number;
  /**
   * Default true: each closed subpath after the first path's is reversed when
   * it runs the other way, and started at its point nearest the first path's
   * start. false keeps every path as given.
   */
  align?: boolean;
}

/** A regular polygon; the first vertex points up at rotate 0. */
export interface PolygonOptions {
  /** A whole number, 3 or more. */
  sides: number;
  radius: number;
  /** Default 0. */
  cx?: number;
  /** Default 0. */
  cy?: number;
  /** Degrees, clockwise. Default 0. */
  rotate?: number;
}

/** A star of `points` outer vertices; the first points up at rotate 0. */
export interface StarOptions {
  /** A whole number, 2 or more. */
  points: number;
  outer: number;
  inner: number;
  cx?: number;
  cy?: number;
  rotate?: number;
}

/** A pie slice, or a ring segment when `inner` is above 0. Angles in degrees, clockwise from up. */
export interface SectorOptions {
  radius: number;
  /** Default 0. */
  inner?: number;
  /** Default 0. */
  from?: number;
  /** Equal to `from`: an empty string. 360 or more from `from`: a whole circle. Below `from`: anticlockwise. */
  to: number;
  cx?: number;
  cy?: number;
}

/** A block arrow from `from` to `to`. */
export interface ArrowOptions {
  from: [number, number];
  to: [number, number];
  /** The shaft's width. */
  width: number;
  /** The head's length; it is twice as wide. An arrow shorter than its head is the head alone, as long as the arrow. */
  head: number;
}

/** A point distribute() lays out. */
export interface DistributedPoint {
  i: number;
  x: number;
  y: number;
  /** The direction of travel in degrees for rotate(): 0 points right, 90 down. A spiral's points face outward. */
  heading: number;
  /** 0 at the first point, 1 at the last. */
  u: number;
  /** A grid's column and row. */
  col?: number;
  row?: number;
}

export interface DistributeLineOptions { from: [number, number]; to: [number, number]; }
export interface DistributeCircleOptions {
  cx: number;
  cy: number;
  radius: number;
  /** Degrees clockwise from up, as shape() takes them (0 by default). */
  from?: number;
  /** A full turn after from by default, spaced 360 / n; otherwise an arc with a point at each end. */
  to?: number;
}
export interface DistributeGridOptions {
  columns: number;
  /** The distance between neighbours in px, or [width, height]. */
  cell: number | [number, number];
  cx?: number;
  cy?: number;
}
export interface DistributeSpiralOptions { radius: number; cx?: number; cy?: number; }
export interface DistributeScatterOptions { width: number; height: number; cx?: number; cy?: number; seed?: number | string; }
export interface DistributePathOptions { /** SVG path data. */ d: string; }

/** A point for falloff(): an object with x and y, such as distribute() gives, or [x, y]. */
export type FieldPoint = { x: number; y: number } | [number, number];
export interface FalloffShared {
  /** Shapes the weight: anything ease() takes. */
  ease?: Ease;
  /** 1 minus the weight. */
  invert?: boolean;
}
export interface FalloffRadialOptions extends FalloffShared { x: number; y: number; radius: number; /** 1 inside it (0 by default). */ inner?: number; }
export interface FalloffLinearOptions extends FalloffShared { x: number; y: number; /** The heading, in degrees (0 right, 90 down). */ angle: number; width: number; }
export interface FalloffBandOptions extends FalloffShared { x: number; y: number; /** The heading the band moves along; the band lies across it. */ angle: number; width: number; }
export interface FalloffRingOptions extends FalloffShared { x: number; y: number; radius: number; width: number; }
export interface FalloffShapeOptions extends FalloffShared {
  /** SVG path data; 1 inside it. */
  d: string;
  x?: number;
  y?: number;
  scale?: number;
  /** Px outside the edge over which the weight falls to 0 (0 by default: a hard edge). */
  width?: number;
  rule?: 'nonzero' | 'evenodd';
}

/**
 * A spring is set in one of two ways: by stiffness, damping and mass, or by
 * duration and bounce, not both. Every number is finite (KN-100 from
 * spring() and settle(), KN-121 from a spring ease).
 */
export interface SpringOptions {
  /** Default 100. */
  stiffness?: number;
  /** Default 10: under-damped, so the spring overshoots. No overshoot at 2 * Math.sqrt(stiffness * mass) or more: 20 for the defaults. */
  damping?: number;
  /** Default 1. */
  mass?: number;
  /**
   * Seconds until the spring stays within 2% of the distance from `to`, as
   * settle() measures it: above 0. The mass is 1 and the stiffness is solved
   * for it, so stiffness, damping and mass are not given with it.
   */
  duration?: number;
  /** With duration: 0 (the default) settles with no overshoot, and toward 1 the spring bounces more. The damping ratio is 1 - bounce. 0 or more, below 1. */
  bounce?: number;
  /** Default 0. */
  from?: number;
  /** Default 1. */
  to?: number;
  /** Hold the value between from and to. */
  overshootClamping?: boolean;
}

export interface StaggerOptions {
  /** Seconds per step of distance from the origin: a finite number, 0 or more. Default 0.05. */
  each?: number;
  /** Seconds from the first item to start to the last, in place of each: a finite number, 0 or more. */
  total?: number;
  /**
   * The origin: 'first' (the default), 'last', 'center', 'edges' (the
   * outermost items first), 'random' (each item's rank in a shuffle seeded by
   * `seed`), or an index from 0 to n - 1.
   */
  from?: 'first' | 'last' | 'center' | 'edges' | 'random' | number;
  /**
   * [columns, rows], whole numbers with a cell for each item: item i sits at
   * column i % columns and row floor(i / columns), and the distance is the
   * straight line between cells. 'first', 'last' and 'center' are then the
   * first cell, the last cell and the grid's centre, an index is that cell,
   * and 'edges' measures to the nearest edge of the grid.
   */
  grid?: [number, number];
  /** With grid: the distance along one axis only. */
  axis?: 'x' | 'y';
  /** How the delays are spread: an item at fraction d of the way from the nearest item's distance to the farthest's starts at ease(d) times the span. Default 'linear'. */
  ease?: Ease;
  /** For 'random': a number or a string. Default 1. */
  seed?: number | string;
}

export interface SweepOptions {
  /** The window's width as a fraction of the items: above 0, up to 4. Default 0.3. */
  width?: number;
  /**
   * 'ramp' (the default) rises from 0 as the window's leading edge reaches
   * the item to 1 as its trailing edge passes, and holds; 'square' is 1
   * under the window; 'triangle' rises and falls back over it; 'round' is a
   * half-sine bump.
   */
  shape?: 'ramp' | 'square' | 'triangle' | 'round';
  /** The order, as stagger() has it in a row. Default 'first'. */
  from?: 'first' | 'last' | 'center' | 'edges' | 'random' | number;
  /** Shapes the rise, and a triangle's fall. Default 'linear'. */
  ease?: Ease;
  /** For 'random': a number or a string. Default 1. */
  seed?: number | string;
}

export interface RepeatOptions {
  /** The move from one copy to the next, px. Default 0. */
  translateX?: number;
  translateY?: number;
  /** The turn from one copy to the next, degrees. Default 0. */
  rotate?: number;
  /** The scale from one copy to the next, above 0. Default 1. */
  scale?: number;
  /** [first, last], 0 to 1, mixed across the copies; a number is the last copy's, from 1. */
  opacity?: number | [number, number];
  /** Copy k takes copy k + offset's transform; a whole number from -10000 to 10000. Default 0. */
  offset?: number;
  /** A transform-origin for every copy, such as '50% 100%'. */
  origin?: string;
}

/** A row of repeat(): `transform` is one matrix(), with `opacity` and `transformOrigin` when given. */
export interface RepeatRow {
  key: number;
  i: number;
  style: { transform: string; opacity?: number; transformOrigin?: string };
}

/**
 * The finishing pass on every rendered frame, after the shutter's average
 * and before the encoder; and live in the page, from config({ finish }),
 * for the vignette, the grain, the dust, the grade's exposure, contrast and
 * saturation and the soften (bloom, aberration and the rest of the grade
 * are the file's only). Each field is off unless given; a number is its
 * amount. Deterministic by the frame number. KN-100 for an unknown field
 * or part or a part out of range, and for a browser without WebGL 2.
 */
export interface FinishOptions {
  /** Amount 0 to 1; size 1 to 8 px (default 1); fps 0 to 240, how many times a second it changes (default 0, still; the frame rate for film grain). */
  grain?: number | { amount: number; size?: number; fps?: number };
  /** Amount 0 to 1; radius 0 to 1 and softness 0.05 to 1, of the half-diagonal (defaults 0.5, 0.6). */
  vignette?: number | { amount: number; radius?: number; softness?: number };
  /** Amount 0 to 2; threshold 0 to 1 (default 0.8); radius 1 to 200 px (default 24). */
  bloom?: number | { amount: number; threshold?: number; radius?: number };
  /** 0 to 8: red and blue sampled toward and away from the centre, 6 px at the corners for each 1. */
  aberration?: number;
  /** 0 to 16: a blur that grows toward the edges, 1.5 px for each 1. */
  soften?: number;
  /** Amount 0 to 1; size 0.5 to 4 (default 1): sparse specks, new each frame. */
  dust?: number | { amount: number; size?: number };
  /** Each part optional, applied in this order; defaults change nothing. */
  grade?: { exposure?: number; contrast?: number; saturation?: number; temperature?: number; lift?: number; gamma?: number; gain?: number };
}

/** What config() reports for the finish: each field on, as an object of all its named parts, the form config({ finish }) takes back. */
export type FinishSettings = {
  grain?: { amount: number; size: number; fps: number };
  vignette?: { amount: number; radius: number; softness: number };
  bloom?: { amount: number; threshold: number; radius: number };
  aberration?: { amount: number };
  soften?: { amount: number };
  dust?: { amount: number; size: number };
  grade?: { exposure: number; contrast: number; saturation: number; temperature: number; lift: number; gamma: number; gain: number };
};

export interface ScrambleOptions {
  /** Seconds until the last character has settled: above 0. Default 1. */
  duration?: number;
  /** What an unsettled character shows, by grapheme. Default 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=?'. */
  chars?: string;
  /** How many times a second an unsettled character changes: above 0. Default 20. */
  fps?: number;
  /** The scrambled characters are the same for the same seed: a number or a string. Default 1. */
  seed?: number | string;
}

export interface SceneEdges {
  /** Seconds the `enter` ramp takes from the clip's start. */
  enter?: number;
  /** Seconds the `exit` ramp takes, ending on the clip's last captured frame. */
  exit?: number;
}

/**
 * A scene definition: an ordinary WildflowerJS component definition, plus
 * `edges` and an optional `seek(local)` method. The extension subscribes the
 * component to the `kinetic` store and adds the SceneContext computeds; a
 * definition that names one of them is warned about in development (KN-152).
 */
export interface SceneDefinition {
  state?: Record<string, unknown>;
  computed?: Record<string, (this: SceneContext & Record<string, any>) => unknown>;
  subscribe?: string[] | Record<string, string[]>;
  props?: Record<string, unknown>;
  edges?: SceneEdges;
  /** Keyframe tracks as data: each entry is a computed of `local`, a style object for Tracks or one value for a Track. */
  keyframes?: Record<string, Track | Tracks>;
  /**
   * What the scene needs from its composition variables: `{ price: Number }` or
   * `{ price: { type: Number, required: true, validator } }`. A failure is
   * KN-130 on the console in every build, and readiness holds the render.
   */
  inputs?: Record<string, InputType | InputDeclaration>;
  /** Queries (wildflower.query names) that must have loaded before frame 0. Full tier only. */
  waitFor?: string[];
  /**
   * Values that ease toward store paths by a spring, each a computed of the
   * same name: in interactive mode on the page's clock, as the sum of one step
   * response per change of the target; in video mode the same spring
   * applied to the target's script, sampled on the root's data-fps. The
   * target is a finite number, or true and false as 1 and 0 (KN-100
   * otherwise). A follow entry wins over a computed or keyframes entry of
   * the same name (KN-153 in development).
   */
  follow?: Record<string, FollowEntry>;
  init?(this: SceneContext & Record<string, any>): void;
  /**
   * The framework's frame-loop hook, `dt` in milliseconds. Runs only in
   * interactive mode: never in video mode, so never in check(), render() or
   * with the HyperFrames runtime on the page. Development builds name a scene
   * with tick() once when it is in a render() or video mode (KN-151); check() makes no video.
   */
  tick?(this: SceneContext & Record<string, any>, dt: number, now: number): void;
  /**
   * Called after every seek with the clip-local time, and once when the scene
   * initializes. A seek that leaves local as it was at the scene's last seek
   * (a scene outside its clip) does not call it again; check() calls it on
   * every seek. A returned promise holds the render's frame capture until it
   * settles.
   */
  seek?(this: SceneContext & Record<string, any>, local: number): void | PromiseLike<unknown>;
  [method: string]: unknown;
}

export interface KineticConfig {
  /** Frames per second when neither the render nor the root's data-fps says. */
  fps?: number;
  /**
   * How seeks arrive: 'event' (the default) listens for HyperFrames' hf-seek;
   * 'timeline' registers an object the runtime drives through its timeline
   * registry, as a fallback.
   */
  channel?: 'event' | 'timeline';
  /** Whether the standalone clock starts on load when no runtime is on the page. Default true. */
  autoplay?: boolean;
  /** The preview bar (play, pause, scrub, frame steps). Also `?preview` in the URL or `data-preview` on the script tag. Never during a render. */
  preview?: boolean;
  /**
   * Whether the standalone clock starts again from 0 at the end. Default
   * true, which holds the last frame 3 s first (none with the preview bar
   * up); `{ hold }` sets those seconds; false holds the last frame
   * (duration - 1/fps) with `playing` false. config() reports `{ hold }` or
   * false. No effect with the HyperFrames player on the page.
   */
  loop?: boolean | { hold: number };
  /**
   * The stage fitted to the window: the root is wrapped in a plain
   * `<div class="kinetic-fit">` and scaled down to the wrapper's width, never
   * up. Default: on when the preview bar is asked for, off otherwise. Never
   * during a render.
   */
  fit?: boolean;
  /**
   * Whether Kinetic plays the composition's audio clips in the preview.
   * Default true; false plays nothing and takes the bar's speaker button
   * away. The render and the levels are unaffected.
   */
  sound?: boolean;
  /**
   * The shutter every render() uses when the call gives none, the preview
   * bar's Render button included: an angle in degrees or { angle, samples }
   * (KN-100 otherwise, an array or another field included). 0, false or
   * null turns it off. config() reports it as { angle, samples }, or false.
   */
  shutter?: number | false | null | ShutterOptions;
  /**
   * The finish every render() uses when the call gives none, and the page
   * shows live where the browser can carry it (FinishOptions). 0, false or
   * null turns it off. config() reports the fields on, or false.
   */
  finish?: FinishOptions | 0 | false | null;
  /**
   * 'auto' (the default): video mode with the preview bar up, interactive mode
   * otherwise. 'interactive' or 'video' sets it. The HyperFrames runtime on the page,
   * a render capturing, check() and render() put the page in video mode
   * whatever the setting. Switching to video keeps the learner's values of
   * the scripted paths aside, and switching back writes them back.
   */
  mode?: 'auto' | 'interactive' | 'video';
}

/** What config() reports: every option, with the loop as { hold } or false and the shutter as { angle, samples } or false. */
export type KineticSettings = Required<Omit<KineticConfig, 'loop' | 'shutter' | 'finish'>> & { loop: false | { hold: number }; shutter: false | Required<ShutterOptions>; finish: false | FinishSettings };

/** A band for level(): 20-250 Hz, 250 Hz-2 kHz, 2-16 kHz, or the loudness (RMS). */
export type LevelBand = 'bass' | 'mid' | 'treble' | 'all';

export interface LevelOptions {
  /** One audio clip alone, by its id; KN-100 when no audio clip has it. */
  clip?: string;
}

/** play({ from, to }): seconds. `from` defaults to the current time, `to` to the composition's duration. */
export interface PlayRange {
  from?: number;
  to?: number;
}

export interface RenderOptions {
  /** Frames per second; the clock's by default. */
  fps?: number;
  /** Seconds; 0 and the composition's duration by default. */
  from?: number;
  to?: number;
  /** An avc1, av01 or vp09 codec string; 'avc1.640028' by default. */
  codec?: string;
  /** Bits per second; 8,000,000 by default. */
  bitrate?: number;
  /** The element to capture: the composition root by default, or a canvas. */
  source?: Element;
  /** Pixel size; the root's data-width and data-height, or a canvas's own, by default. */
  width?: number;
  height?: number;
  /** The file name without .mp4; the root's data-composition-id by default. */
  name?: string;
  /** false keeps the file in the result only. */
  download?: boolean;
  onProgress?: (frame: number, frames: number) => void;
  /**
   * An AbortSignal, as fetch() takes. Aborting stops the frames, closes the
   * encoders, puts the page and the clock back as after a render, and the
   * promise rejects with `signal.reason` (an AbortError DOMException by
   * default); one already aborted rejects at once. Anything else is KN-100.
   */
  signal?: AbortSignal;
  /** Whether the file has the audio clips' sound. Default true; false writes the video alone. */
  audio?: boolean;
  /**
   * 'mp4a.40.2' (AAC-LC, the default) or 'opus'. With no AAC encoder in the
   * browser the default falls back to Opus (KN-202 in development); a codec
   * the browser cannot encode is KN-100.
   */
  audioCodec?: 'mp4a.40.2' | 'opus';
  /** The sound's bits per second; 192,000 by default. */
  audioBitrate?: number;
  /**
   * Motion blur: each frame the average of `samples` seeks at
   * t + (k / samples) * (angle / 360) / fps, forward from the frame's time
   * and short of the next, so a cut stays a cut; `frame` and `clipFrame`
   * keep the frame's own number through its samples. An angle in degrees or
   * { angle, samples }; 0, false or null turns it off. config({ shutter }) by
   * default. About `samples` times as long as a render without it. Not
   * applied with the HyperFrames runtime on the page, whose player rounds
   * each seek down to one of its own frames: one seek a frame, the store's
   * shutter stays 0, and KN-205 once per page in development. KN-100 for an
   * angle outside (0, 360], samples outside 2 to 64, another field, or
   * another type, an array included.
   */
  shutter?: number | false | null | ShutterOptions;
  /** The finishing pass for this file (FinishOptions); config({ finish }) by default; 0, false or null for none. */
  finish?: FinishOptions | 0 | false | null;
}

export interface RenderResult {
  blob: Blob;
  name: string;
  frames: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  /** The sound track's codec, or null for a file with no sound. */
  audioCodec: 'mp4a.40.2' | 'opus' | null;
  /** Wall-clock milliseconds the render took. */
  ms: number;
}

/** What every check() report carries: the root's data-kinetic-ready, and the errors printed or thrown during the seeks. */
export interface CheckState {
  ready: 'true' | 'failed' | null;
  errors: number;
  /** The first error's message, when there was one. */
  firstError?: string;
}

export type CheckReport =
  | ({ ok: true; frames: number; samples: number } & CheckState)
  | ({ ok: false; reason: 'readiness failed' | 'a seek threw'; frames: number; samples: number } & CheckState)
  | ({ ok: false; frame: number; time: number; element: string; property: string; first: string; second: string } & CheckState);

export interface WildflowerKinetic {
  readonly version: string;
  /** The HyperFrames runtime version this build was tested against. */
  readonly compat: { readonly hyperframes: string };
  /** Registers a component (`wildflower.component`) whose every frame is a function of time. */
  scene(name: string, definition: SceneDefinition): unknown;
  /**
   * Resolves when frame 0 may be captured: the first scan, fonts, every
   * waitFor query, the images under the scenes and the audio clips' decode,
   * the transitions' maps, the effects' image sources, the Lottie
   * animations' load and the animated images' decode.
   * Rejects with the KN error (117, 130, 131, 133, 135, 138, 180, 181) that holds the render,
   * or KN-100 for a step script's path whose store does not exist or that names a computed.
   */
  ready(): Promise<void>;
  /**
   * The render self-test: seeks a shuffled sample of frames twice and
   * compares the DOM. Fails when readiness failed, when an error was printed
   * or thrown during the seeks, or on the first frame whose DOM differed.
   * `seed` picks the sample. `samples` is 1 or more; a fraction is rounded
   * up, and more than the composition's frames compares every frame. A
   * playing clock plays on afterwards.
   */
  check(options?: { samples?: number; seed?: number | string }): Promise<CheckReport>;
  /**
   * An MP4 from the page through WebCodecs, every frame a settled seek. A
   * canvas source works in any Chrome; the composition's DOM needs
   * drawElementImage (Chrome 154 behind --enable-blink-features=CanvasDrawElement).
   * Downloads the file unless `download: false`. With an audio clip in the
   * composition, the file has its mix as an AAC or Opus track. With the
   * HyperFrames runtime on the page, the fps has to divide the root's
   * data-fps: KN-206 rejects when a frame's seek lands off the frame's time.
   */
  render(options?: RenderOptions): Promise<RenderResult>;
  /** Moves the clock: the HyperFrames player's renderSeek when a runtime is on the page, else the store directly. */
  seek(seconds: number): void;
  /**
   * Plays: the runtime's player, or the standalone requestAnimationFrame
   * clock. With a range, seeks to `from`, plays, and holds the last frame
   * before `to` with `playing` false (KN-100 for a bad range). In interactive mode
   * with steps and no range, plays on to the current step's hold, and at or
   * past it plays the step again from its start; past the last step's end,
   * on to the composition's end, and at the end the last step again.
   */
  play(range?: PlayRange): void;
  pause(): void;
  /** Sets options and returns the settings in force; with no argument, only returns them. An unknown option throws KN-100. */
  config(options?: KineticConfig): KineticSettings;
  /**
   * Gives the data-step clip with this id its behaviour (KN-100 for a bad
   * option, KN-120 and KN-121 for a script track). A step is a clip with an
   * id and data-step; its range runs to the next step's start.
   */
  step(id: string, definition?: StepDefinition): void;
  /**
   * Interactive mode: does nothing while canAdvance is false (an `until`
   * that is falsy); otherwise enters the next step at once with its entry
   * values, wherever the step is, the rest of it unplayed; nothing on the
   * last step or past it. Video mode: seeks to the next step's start, a
   * playing clock playing on with its hold.
   */
  next(): void;
  /**
   * Interactive mode: enters the previous step from its start, with its entry
   * values, or past the last step's end the last step; nothing at the first.
   * Video mode: seeks to its start, a playing clock playing on with its hold.
   */
  back(): void;
  /** Interactive mode: enters a step by id or index from 0. Video mode: seeks to its start, a playing clock playing on with its hold. KN-100 for no such step. */
  go(step: string | number): void;

  /**
   * The easing function for a name (KN-121 for an unknown one). A spring ease
   * takes seconds, not progress: `ease('spring')(0.5)` is `spring(0.5)`.
   * interpolate passes it the segment's progress and then the seconds elapsed
   * in the segment, and the spring reads the seconds.
   */
  ease(name: Ease): (p: number) => number;
  /**
   * A value from keyframe times and values; clamps outside the range unless
   * told otherwise. A t that is not a number gives the first value; an
   * infinite t on an 'extend' side gives that side's end value.
   */
  interpolate(t: number, at: number[], to: number[], options?: InterpolateOptions): number;
  interpolate(t: number, at: number[], to: string[], options?: InterpolateOptions): string;
  /** One track's value at t, with its own options; a number with the track's unit is a string. KN-100 for anything after the track. */
  interpolate(t: number, track: Track): number | string;
  /** The style object for t seconds, from an object of tracks. One track alone is KN-120: read it with interpolate(t, track). With only plain numbers the time is never read, so any t does. */
  styleAt(t: number, tracks: Tracks): Record<string, string | number>;
  /**
   * A damped spring in closed form: the position at t seconds, from rest; `to` at Infinity.
   * KN-100 for a t that is not a number or is NaN, as for every function that takes the time first.
   */
  spring(t: number, options?: SpringOptions): number;
  /**
   * The seconds a spring with these options, either form, takes to stay
   * within 2% of the distance from `from` to `to`; with overshootClamping, an
   * overshoot held at `to` does not count. Infinity with no damping. A spring
   * set by duration gives that duration, to well within 1 ms.
   */
  settle(options?: SpringOptions): number;
  /**
   * t's progress from `from` to `to` seconds as 0 to 1, clamped, shaped by
   * `ease` when given. A spring ease reads the seconds since `from` and runs
   * on past `to`. KN-100 unless t is a number and from and to are finite with
   * to after from; KN-121 for an unknown ease.
   */
  ramp(t: number, from: number, to: number, ease?: Ease): number;
  /**
   * a + (b - a) * p for two numbers; for two colors, the mix interpolate
   * makes (per channel, or in oklch with `space`), as an rgb() or rgba()
   * string; for two text values with the same text, every number and color in
   * them mixed, as a text track mixes them. p is not clamped. KN-100 for a p
   * that is not finite, a space that is neither, or a pair that is none of
   * these, with the first difference for two text values.
   */
  mix(a: number, b: number, p: number, options?: { space?: 'rgb' | 'oklch' }): number;
  mix(a: string, b: string, p: number, options?: { space?: 'rgb' | 'oklch' }): string;
  /**
   * The delay in seconds for item i of n, for styleAt(this.local - stagger(i, n, opts), tracks).
   * Delays count from the item nearest the origin, which starts at 0: an
   * item at fraction d of the way from the nearest item's distance to the
   * farthest's starts at ease(d) times the span, which is `total`, or `each`
   * times the farthest item's distance past the nearest's. So with 'center'
   * and an even n the two middle items start at 0, and `total` is the time
   * from the first start to the last. 0 for one item. KN-100 unless i is a
   * whole number from 0 to n - 1 and n one from 1 to 1000000, or for a bad option;
   * KN-121 for an unknown ease.
   */
  stagger(i: number, n: number, options?: StaggerOptions): number;
  /**
   * Item i of n's weight, 0 to 1, under a window that sweeps through the
   * items as p goes from 0 to 1 (a range selector): use it as the time of
   * one-second tracks, styleAt(sweep(i, n, p), tracks). KN-100 for a bad i, n,
   * p or option; KN-121 for an unknown ease.
   */
  sweep(i: number, n: number, p: number, options?: SweepOptions): number;
  /**
   * Rows for a data-list of n copies, each the transform of the one before
   * it again, as one matrix() (a repeater). KN-100 unless n is a whole
   * number from 1 to 10000, or for a bad option.
   */
  repeat(n: number, options?: RepeatOptions): RepeatRow[];
  /** t stepped to fps frames a second, Math.floor(t * fps + 1e-9) / fps, for animation on twos. KN-100 unless fps is a finite number above 0. */
  posterize(t: number, fps: number): number;
  /** t before `from`; from then on, from + ((t - from) mod (to - from)), in [from, to); `to` at t = Infinity, as a track that wraps holds its end there. KN-100 unless from and to are finite with to after from. */
  loop(t: number, from: number, to: number): number;
  /** t before `at`, `at` until at + length, and t - length after. KN-100 unless at is finite and length finite and 0 or more. */
  hold(t: number, at: number, length: number): number;
  /** The blur in px of a thing at depth z when the focal plane is at `plane`: 0 on the plane, `max` well away from it. */
  focus(z: number, plane: number, options?: FocusOptions): number;
  /** A seeded generator: each call gives the next number in 0..1. */
  random(seed: number | string): () => number;
  /** 1-D gradient noise in -1..1: 0 at whole numbers, smooth between, the same for the same seed. */
  noise(x: number, seed: number | string): number;
  /**
   * 2-D gradient noise in -1..1: 0 on the integer lattice, smooth between,
   * the same for the same seed; 0 for a coordinate that is not finite. It
   * peaks near ±0.75, with 95% of values within ±0.35 (noise() peaks near
   * ±0.95, 95% within ±0.62), so scale it for the amount you want.
   */
  noise2(x: number, y: number, seed: number | string): number;
  /** 3-D gradient noise in -1..1, as noise2(); it peaks near ±0.5, with 95% of values within ±0.25. */
  noise3(x: number, y: number, z: number, seed: number | string): number;
  /**
   * The style for the world, the element that holds a scene's layers, for a
   * camera with these tracks at t seconds. Bind it with data-bind-style on
   * an element inside the scene.
   */
  camera(t: number, tracks?: CameraTracks | null, options?: CameraOptions): CameraStyle;
  /**
   * The style for a layer at depth z px inside the world (negative is
   * farther): translateZ(z px) scale((P - z) / P), so a full-frame layer
   * looks at rest as it would at z = 0. The scale is about the element's
   * own centre, so it holds only a layer centred on the world. KN-100 for a
   * z at or beyond the perspective, or one that is not finite.
   */
  depth(z: number, options?: DepthOptions): { transform: string };
  /**
   * Camera shake at t seconds (for an impact, the seconds since the hit),
   * from layered noise, the same everywhere for the same t, profile and
   * seed. KN-100 for an unknown profile, a t that is not finite, an amount
   * below 0 or a speed of 0 or less.
   */
  shake(t: number, profile: ShakeProfile, options?: ShakeOptions): Shake;
  /**
   * A value wandering between -amplitude and amplitude, as After Effects'
   * wiggle: every 1 / frequency seconds it passes through a value the seed
   * draws in that range, smoothly and never past the values either side.
   * The same for the same t and options. Call once per axis with its own
   * seed; for stop motion, step t with posterize() at the frequency, and
   * each step gets a value of its own. KN-100 for a t that is not finite, a
   * frequency of 0 or less, an amplitude below 0 or a seed that is neither
   * a number nor a string.
   */
  wiggle(t: number, options?: WiggleOptions): number;
  /**
   * Rows for a data-list of copies of one element, for motion blur in the
   * preview: copy k of N styled at t + (k / N) * (angle / 360) / fps, at 1/N
   * of its opacity with mix-blend-mode plus-lighter. The opacity is the
   * style's (1 when it has none; '50%' is 0.5), not the stylesheet's, so a
   * base opacity goes in the style. The list's element needs
   * isolation: isolate, or the copies brighten the scene behind them. One
   * row at t inside a render with a shutter. `style` is tracks, as styleAt()
   * takes, or a function of the time that returns a style object. KN-100 for
   * a t that is not finite, a style that is neither, a style function that
   * returns no object, or an option out of range; KN-120 for a malformed
   * track.
   */
  smear(t: number, style: Tracks | ((s: number) => Record<string, string | number>), options?: SmearOptions): SmearRow[];
  /**
   * Marks a mover leaves, each a pure function of its time or place.
   * 'ghosts': copy k of count styled at t - k * lag, its opacity times
   * 1 - fade * k / count, shrunk by scale(1 - scale * k); defaults count 6,
   * lag 0.04, fade 0.8, scale 0. 'ribbon': trimPath(d, u - length, u, { by }),
   * length 0.1 by default. 'dots': count marks (12 by default) evenly along
   * d, each 'past' once u reaches it. KN-100 for an unknown kind, a t or u
   * that is not finite, or a missing or bad option.
   */
  trails(kind: 'ghosts', t: number, options: { style: Tracks | ((s: number) => Record<string, string | number>); count?: number; lag?: number; fade?: number; scale?: number }): GhostRow[];
  trails(kind: 'ribbon', u: number, options: { d: string; length?: number; by?: 'length' | 'segment' }): string;
  trails(kind: 'dots', u: number, options: { d: string; count?: number; by?: 'length' | 'segment' }): TrailDot[];

  /**
   * The two style objects of a transition at p, the progress the caller has
   * already eased: `in` for what comes in, `out` for what goes out, the
   * same values data-clip-transition, data-clip-enter and data-clip-exit write on clips.
   * `in` is {} at p = 1 and `out` is {} at p = 0 (cover's in and reveal's
   * out keep zIndex: 1). Bind them with data-bind-style. KN-100 for an unknown kind,
   * a direction the kind does not take, or a p that is not a finite number.
   */
  transition(kind: TransitionKind, p: number, options?: { direction?: TransitionDirection }): TransitionStyles;

  /**
   * A shader effect drawn with WebGL 2 into `canvas` from an <img>, <video>
   * or <canvas>: halftone, stipple, dither or duotone. Kinetic draws it after
   * each seek has settled, once the footage's frame has landed, and again
   * only when its parameters, its size or its source's frame have changed (a
   * canvas source on every seek; an <img> also when it loads). The canvas gets
   * preserveDrawingBuffer, a drawing size of its shown size times the device
   * pixel ratio, at most its CSS box times that (its CSS box in a render),
   * and the source stretched over it; a canvas with no CSS size of its own is
   * held at the size it had. With `scene: this` it follows that scene's
   * local time and is disposed with the scene; without, it follows the
   * composition time until dispose(). An effect whose canvas leaves the page is
   * disposed at the next seek. KN-100 for an unknown kind or parameter, a bad
   * value, a source that is not an <img>, <video> or <canvas>, or a canvas
   * with no WebGL 2 context; KN-204 at the first draw from a source of another
   * origin without CORS, once, the source then skipped until it changes.
   */
  effect<K extends EffectKind>(canvas: HTMLCanvasElement, options: EffectOptions<K>): Effect<K>;

  /**
   * Printed shading: marks paint a density field (how much ink each point
   * gets), drawn as stipple, splatter, halftone or dither in each mark's ink with
   * effect(). The option marks(m, t), which every layer needs, is called
   * before each draw with the time to paint (the scene's local time with
   * `scene: this`, else the composition time) and adds the marks for it: band,
   * glow, edge, fill, paint, or a list with marks([…]). Marks drawn together
   * belong on one layer: each layer is one canvas and one WebGL context.
   * fps: n gives the noise a new seed n times a second; freeze and move say
   * what moving marks do between scatters. KN-100 for a bad call or mark (a
   * mark's from the seek's draw), for no marks, and for a third argument.
   */
  shade<K extends ShadeKind = 'stipple'>(canvas: HTMLCanvasElement, options: ShadeOptions<K>): ShadeLayer<K>;

  /**
   * The content under `element` blurred by `radius` px where the marks' field
   * is full and left sharp where it is empty: the element gets
   * backdrop-filter: blur() and a mask-image of the field (a quarter of its
   * width and height), painted in the seek's media phase so the seek waits
   * for the mask to decode. Two bands give tilt-shift focus, and a glow
   * blurs a round patch, most at its centre. The mask blends between sharp
   * and fully blurred; it does not vary the radius. The marks are painted
   * for the scene's local time with `scene: this`, else the composition
   * time. KN-100 for a bad element, option or mark, for no marks, and for a
   * third argument.
   */
  blur(element: HTMLElement, options: BlurOptions): BlurLayer;

  /**
   * The drawn look: strokes in pencil, pen and ballpoint laid by a hand that
   * speeds up and slows down, wanders a little and presses in and lifts
   * off, drawn on from `start` in the order planned (or already drawn with
   * `drawn: true`). Baked once at the first draw; each frame is one WebGL
   * pass, so any seek order draws the same pixels, and a drawing moved by
   * CSS catches the paper's tooth, which is fixed to the frame, anew. Up to
   * 16 inks. KN-100 for a bad call, option, ink or stroke.
   */
  draw(canvas: HTMLCanvasElement, options: DrawOptions): DrawSheet;

  /**
   * Line boil on SVG path data: the outline sampled every `detail` px and
   * each sample moved along its normal by up to about `amount` px of noise
   * read every `scale` px along it, returned as a polyline; with `t` and
   * `fps` the noise's seed steps `fps` times a second, held for the first
   * `delay` seconds of `t`. A closed subpath
   * stays closed, with no jump where it closes when it is longer than
   * `scale` px. It works on paths only; for a canvas, an image or a video
   * use effect()'s boil kind. KN-100 for bad path data or a bad option.
   */
  boil(d: string, options?: BoilOptions): string;

  /**
   * Lines of type drawn on a canvas from a variable font's baked outlines
   * (the outline baker makes them), each letter with its own weight, slant,
   * offset, scale, rotation, opacity, blur and colour, placed from its advance
   * and kerning at its own setting. The option lines(m, t) is called before
   * each draw with the time (the scene's local time with `scene: this`,
   * else the composition time) and adds lines with m.line(). The canvas is drawn
   * at its shown size times the device pixel ratio, its CSS box in a
   * render. KN-100 for outlines not the baker's, no lines, a third
   * argument, a bad option, or a character the outlines do not hold.
   */
  text(canvas: HTMLCanvasElement, options: TextOptions): TextLayer;

  /**
   * A lottie-web animation (what lottie.loadAnimation() returns, or any
   * object with the same members) on Kinetic's clock. On every seek, once it
   * has loaded, goToAndStop((t - start) * rate * frameRate, true), with t the
   * scene's local time with `scene: this` and the composition time
   * without: the first frame before
   * start, and past the end totalFrames - 1, or with loop the start again.
   * Subframes on. Put on the clock's frame at once and again when it loads.
   * Readiness, check() and render() wait for it to load; a data_failed, or an
   * error before it has loaded, is KN-180, printed once on every build,
   * holding readiness and marking the page failed. Call it in the same task
   * as loadAnimation(), since an event before it is missed. Returns a
   * handle whose dispose() hands it back; its destroy event (call destroy() in the
   * scene's destroy(): lottie-web keeps every animation until then) and the
   * removal of the scene it was given hand it back too, and lottie() again
   * for the same animation replaces its options. With the HyperFrames
   * runtime on the page, which seeks lottie-web animations itself, Kinetic
   * does not seek it, and start, rate and loop do not apply. KN-100 for an
   * object without goToAndStop() and addEventListener() or a bad option.
   */
  lottie(animation: LottieAnimation, options?: LottieOptions): LottieHandle;

  /**
   * A GIF, animated WebP or APNG fetched and decoded once per URL with
   * WebCodecs' ImageDecoder, drawn by time. Readiness, check() and render()
   * wait for every one asked for so far: with `scene: this` only while that
   * scene is on the page, without one for good. A file that cannot be fetched or decoded
   * is KN-181, printed once on every build, holding readiness and marking
   * the page failed. Every frame stays decoded, width x height x 4 bytes, so
   * keep animated images small. KN-100 for a src that is empty or not a
   * string, and in a browser without ImageDecoder.
   */
  animatedImage(src: string, options?: { scene?: SceneContext }): AnimatedImage;

  /**
   * Two or more SVG paths, each a d string or a path("…") value, returned in
   * the same forms as absolute cubics with the same commands and segment
   * count, ready to be a text track's `to` or interpolate()'s values.
   * Subpaths match in order. KN-100 for fewer than two paths, an empty path,
   * path data the grammar rejects (with the index), a different number of
   * subpaths, or a bad `segments`.
   */
  matchPaths(paths: string[], options?: MatchPathsOptions): string[];
  /**
   * Path data for a shape, so a track can drive every option. KN-100 for an
   * unknown kind, a missing option, a value that is not a finite number, or a
   * count (sides, points) that is not whole.
   */
  shape(kind: 'polygon', options: PolygonOptions): string;
  shape(kind: 'star', options: StarOptions): string;
  shape(kind: 'sector', options: SectorOptions): string;
  shape(kind: 'arrow', options: ArrowOptions): string;
  /**
   * The stretch of a path from fraction `from` to fraction `to` of it, each
   * clamped to 0..1, as absolute cubics with a move wherever it crosses into
   * another subpath; '' when from is at or past to. By length (the default)
   * or by segment, each segment an equal share with the curve's own
   * parameter inside it. A closed subpath taken whole keeps its Z. A
   * path("…") value comes back in the same form. [top, bottom], two edges
   * of one subpath each, gives the band between them closed, the bottom
   * turned round first when it runs the other way. KN-100 for d that is no
   * path data, a from or to that is not finite, an unknown by, or band
   * edges that are not two one-subpath paths.
   */
  trimPath(d: string | [string, string], from: number, to: number, options?: { by?: 'length' | 'segment' }): string;
  /** A path's length in its own units, from the measure trimPath() cuts by length with. KN-100 for d that is no path data. */
  pathLength(d: string): number;

  /**
   * n points laid out: along a line (both ends), round a circle or an arc, on
   * a grid (row by row, as stagger({ grid }) numbers cells), in a sunflower
   * spiral, in a seeded even scatter, or evenly by length along SVG path data.
   * New objects on every call; a scatter's search and a path's measure are
   * kept. KN-100 for an unknown kind, a bad n or a bad option.
   */
  distribute(kind: 'line', n: number, options: DistributeLineOptions): DistributedPoint[];
  distribute(kind: 'circle', n: number, options: DistributeCircleOptions): DistributedPoint[];
  distribute(kind: 'grid', n: number, options: DistributeGridOptions): DistributedPoint[];
  distribute(kind: 'spiral', n: number, options: DistributeSpiralOptions): DistributedPoint[];
  distribute(kind: 'scatter', n: number, options: DistributeScatterOptions): DistributedPoint[];
  distribute(kind: 'path', n: number, options: DistributePathOptions): DistributedPoint[];
  /**
   * A weight from 0 to 1 for a point, from a field: radial (1 inside inner,
   * 0 at radius), linear (an edge heading toward angle: 1 behind, 0 at width
   * ahead), band (1 on the line, 0 at width either side), ring (1 at radius,
   * 0 at width either side) or shape (1 inside the path, 0 at width outside).
   * KN-100 for an unknown kind, a point without x and y, or a bad option.
   */
  falloff(kind: 'radial', point: FieldPoint, options: FalloffRadialOptions): number;
  falloff(kind: 'linear', point: FieldPoint, options: FalloffLinearOptions): number;
  falloff(kind: 'band', point: FieldPoint, options: FalloffBandOptions): number;
  falloff(kind: 'ring', point: FieldPoint, options: FalloffRingOptions): number;
  falloff(kind: 'shape', point: FieldPoint, options: FalloffShapeOptions): number;

  /** Rows for a data-list, one per grapheme ('letter', the default) or per word; whitespace gets its own rows, flagged `space`. */
  split(text: unknown, by?: 'letter' | 'word'): SplitRow[];
  /** The first Math.floor(t * cps) graphemes of the text (cps defaults to 20). */
  typewriter(t: number, text: unknown, cps?: number): string;
  /**
   * The text settling left to right from scrambled characters: grapheme k of
   * L settles at duration * (k + 1) / L, and shows a character of `chars`
   * picked by the seed until then. Whitespace is never scrambled. KN-100 for
   * a t that is not a number, a bad option, or an option it does not have.
   */
  scramble(t: number, text: unknown, options?: ScrambleOptions): string;
  /** Intl.NumberFormat with 'en-US' unless `locale` says otherwise; the other options are Intl's. A locale or options Intl refuses is KN-100. */
  format(n: number, options?: Intl.NumberFormatOptions & { locale?: string }): string;
  /**
   * A line measured with the canvas's own measureText(): its advance width
   * and ink box, `tracking` in em added between graphemes and never after
   * the last. `letters: true` adds split()'s rows with each grapheme's left
   * edge and advance; `width` adds the font size in px at which the line is
   * that wide. Readiness waits for each font measured with. The numbers
   * depend on the font files, so a web font measures the same everywhere and
   * a system font may not. Needs a document. KN-100 for text that is no
   * string, a font the canvas refuses, a tracking that is not finite, a
   * width that is not above 0, or an empty line to fit.
   */
  textMetrics(text: string, font: string, options?: { tracking?: number; letters?: boolean; width?: number }): TextMetricsResult;

  /**
   * About `count` round values from at or below min to at or above max. count
   * is 2 to 1,000 (default 5). KN-100 for a range too small, or numbers too
   * large, to divide into round steps.
   */
  ticks(min: number, max: number, count?: number): number[];
  /**
   * Each row's value and position at a fractional keyframe t; whole numbers
   * of t are the keyframes `by` knows. `by` is called for the whole numbers
   * either side of t, whatever t is, and a value that is not a finite number
   * (as from a keyframe past the data) counts as 0.
   */
  rank<T>(t: number, rows: T[], by: (row: T, keyframe: number, index: number) => number, options?: { ascending?: boolean }): RankedRow<T>[];
  /**
   * The caption line current at t from a HyperFrames transcript, with per-word
   * state and progress. The lines are grouped once per array and length: a
   * word pushed on is seen, an edit in place that keeps the length is not.
   * KN-100 for a bad option: maxWords and maxChars are whole numbers from 1,
   * maxGap and hold 0 or more (each may be Infinity), sentences a boolean.
   */
  captions(t: number, words: TranscriptWord[], options?: CaptionOptions): CaptionLine;
  /**
   * The row of a timing table current at t: the last whose `at` is at or
   * before t, until its own `end` or the next row's `at`. Empty before the
   * first row and in a gap after a row's end. Rows are read in time order;
   * of equal times the last is current. Checked and sorted once per array
   * and length, as captions() groups. KN-100 for rows that are no array, a
   * row that is no object, an `at` that is not finite, or an `end` before
   * its `at`.
   */
  moment<T extends MomentRow>(t: number, rows: T[]): Moment<T>;
  /**
   * SRT or WebVTT subtitles as a transcript for captions(): one word per
   * entry, ids 'w0', 'w1', ..., each cue's words sharing its time by their
   * lengths in characters, the last ending at the cue's end. Line breaks are
   * spaces; VTT cue settings, tags, SRT override tags ({\an8}), a byte order
   * mark, headers and NOTE, STYLE and REGION blocks are dropped; a < that
   * opens no tag stays; &amp; &lt; &gt; &nbsp; &lrm; and &rlm; are decoded,
   * and a non-breaking space joins its two words. Each timing line starts a
   * cue, with or without a blank line before it. KN-100 for a value that is
   * not a string or a text with no cue.
   */
  srt(text: string): Required<TranscriptWord>[];
  /** A pulse from a HyperFrames beat file: each beat's strength decaying as e^(-elapsed / decay). Cached like captions(). */
  beat(t: number, beats: BeatFile | Beat[], options?: { decay?: number }): number;
  /**
   * Composition seconds for a time written as data-start writes one: a
   * number, a name, or a name plus or minus seconds ('stop + 0.4'). A name
   * is a marker from an audio clip's data-markers (seconds into its file,
   * through the clip's start, media start and rate), else an element's id,
   * which is when that element ends; 'intro.start' is when it starts.
   * KN-100 for anything else.
   */
  timeOf(time: string | number): number;
  /**
   * The beat grid of the audio clip with that id, or of the one clip with
   * data-tempo: from its data-tempo (beats per minute), data-downbeat (a bar's
   * start, in file seconds) and data-meter (beats to a bar, 4 by default).
   */
  tempo(id?: string): Tempo;

  /**
   * The level of the audio clips' mix (or of one clip, by id) in a band at
   * composition time t, 0 to 1, read at the nearest frame from tables built
   * at readiness: each band from -60 dB to its loudest frame, falling over
   * about 0.15 s. 0 before the decode and with no audio clip (KN-137).
   * KN-100 for an unknown band or clip.
   */
  level(t: number, band?: LevelBand, options?: LevelOptions): number;
  /** `bins` levels (1 to 64, 16 by default), 0 to 1, from 20 Hz to 16 kHz on a logarithmic scale, low to high. Zeros as level() reads 0. */
  spectrum(t: number, bins?: number): number[];
}

/**
 * The kinds of transition. push, cover, reveal and wipe take a side
 * (push, cover and reveal default to from-right, wipe to from-left); clock
 * takes clockwise (the default) or anticlockwise; the others take none.
 * The attributes also take luma, halftone and dissolve, which mask the clip
 * with a map through an SVG filter and so have no styles for transition().
 */
export type TransitionKind = 'fade' | 'push' | 'cover' | 'reveal' | 'wipe' | 'iris' | 'clock' | 'zoom' | 'blur' | 'flip';

/**
 * effect()'s parameters by kind, every one optional and every number or
 * colour free to change on each seek. Colours are #rgb, #rrggbb (with or
 * without alpha) or rgb() / rgba(). density, -1 to 1, moves a halftone, a
 * stipple or a duotone toward ink (or the shadow); contrast stretches the
 * brightness about its middle.
 */
export interface EffectParams {
  /** Dots on a grid: their area is the source's darkness at each cell's centre, filling the cell at full darkness. */
  halftone: {
    /** The grid's spacing in CSS px (12). */
    cell?: number;
    /** The grid's angle in degrees (45). */
    angle?: number;
    /** 'circle' (the default), 'square' or 'line'. */
    shape?: 'circle' | 'square' | 'line';
    density?: number;
    /** 'ink' (the default), or 'source' for each dot in the source's colour under it. */
    color?: 'ink' | 'source';
    ink?: string;
    paper?: string;
  };
  /** A dot of ink in each square whose seeded hash falls under the source's darkness. */
  stipple: {
    /** The squares' size in CSS px (1). */
    scale?: number;
    /** The hash's seed, a whole number (1); the same seed gives the same dots. */
    seed?: number;
    density?: number;
    contrast?: number;
    /** 0 (the default) to 1: how far each speck shrinks toward its square's centre where the darkness is low, as crayon pressed lightly leaves smaller marks. */
    grade?: number;
    /** 'square' (the default) or 'round'. */
    speck?: 'square' | 'round';
    /** 'ink' (the default), or 'source' for each speck in the source's colour under it. */
    color?: 'ink' | 'source';
    ink?: string;
    paper?: string;
  };
  /** An ordered dither on a Bayer matrix. */
  dither: {
    /** The matrix: 2, 4 (the default) or 8. */
    matrix?: 2 | 4 | 8;
    /** Steps from ink to paper, 2 (the default) to 16; with more than 2 the steps between are mixes of the two. */
    levels?: number;
    /** The size of a matrix cell in CSS px (1). */
    scale?: number;
    /** 'ink' (the default), or 'source' for the ink in the source's colour. */
    color?: 'ink' | 'source';
    ink?: string;
    paper?: string;
  };
  /** The source's brightness from the shadow colour to the highlight colour. */
  duotone: {
    shadow?: string;
    highlight?: string;
    contrast?: number;
    density?: number;
  };
  /** The source itself, each pixel taken from up to about `amount` px away by smooth seeded noise: line boil on a canvas, an image or a video. Give it `fps` for edges that change a few times a second. */
  boil: {
    /** About the largest move, px (2). */
    amount?: number;
    /** The noise's size, px across (30). */
    scale?: number;
    /** The noise's seed, a whole number (1). */
    seed?: number;
    /** Octaves of noise, 1 (the default) to 6. */
    rough?: number;
  };
  /** Round drops of ink in several sizes, more of them where the source is darker and the large ones only where it is darkest, as spray leaves them. */
  splatter: {
    /** The smallest drops' size in CSS px (2). */
    min?: number;
    /** The largest drops' size in CSS px (24); the sizes between step evenly from it to min, up to six of them, each about half the last. A drop is from half its size to all of it, and smaller where the source is lighter. KN-100 when min is over max. */
    max?: number;
    /** The drops' seed, a whole number (1). */
    seed?: number;
    density?: number;
    contrast?: number;
    /** 0 to 1 (0.3): how ragged a drop's edge is. */
    warp?: number;
    /** 0 to 1 (0.5): how much each drop's strength varies; 0 prints every drop at full strength. */
    vary?: number;
    /** 'ink' (the default), or 'source' for each drop in the source's colour at its middle. */
    color?: 'ink' | 'source';
    ink?: string;
    paper?: string;
  };
}
export type EffectKind = keyof EffectParams;
/** The `scene` option of effect(), shade(), blur(), text() and lottie(). */
export interface LayerScene {
  /**
   * The scene's own component, `this` in its init() or seek(): the layer
   * follows that scene's local time and is disposed with the scene, wherever
   * and whenever it was made. Without it, the layer follows the composition
   * time until dispose(). KN-100 for anything else; set() cannot change it.
   */
  scene?: SceneContext;
}
export type EffectOptions<K extends EffectKind> = {
  /** What the effect is drawn from; it is stretched over the canvas. */
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
  kind: K;
} & LayerScene & EffectParams[K] & EffectTiming<K>;
/** A seeded kind's boil: stipple, splatter and boil take a new seed on a clock. */
export type EffectTiming<K extends EffectKind> = K extends 'stipple' | 'splatter' | 'boil' ? {
  /** New seeds a second, from seed, on the scene's local time with `scene`, else the composition time; 0 (the default) keeps one. */
  fps?: number;
  /** Seconds before the boil starts (0); the next seed comes 1 / fps s after. */
  delay?: number;
} : {};
export interface Effect<K extends EffectKind = EffectKind> {
  /** Changes some parameters; the next seek draws with them. KN-100 for one the kind does not take, or a bad value. */
  set(params: EffectParams[K] & EffectTiming<K>): Effect<K>;
  /** Stops drawing and releases the canvas's WebGL context, which then takes no new effect. An effect made with `scene` is disposed when the scene is destroyed; call this to stop one sooner. */
  dispose(): void;
}

/** A shape a mark is cut to: a circle, a rectangle, a polygon, SVG path data, or a Path2D. In px from the canvas's top left. */
export type ShadeClip = { circle: [number, number, number] } | { rect: [number, number, number, number] } | { polygon: Array<[number, number]> } | { path: string } | Path2D;
/** What every mark takes. */
export interface ShadeMarkOptions {
  /** The shape the mark is cut to. */
  clip?: ShadeClip;
  /** The density at full, 0 to 1 (1). */
  amount?: number;
  /** The mark's colour, #rgb, #rrggbb or rgb(); an alpha thins the mark ('#000'). */
  ink?: string;
  /** How the density falls away: an ease from the far end (0) to full (1). 'linear' (the default), 'smooth', any of Kinetic's eases, or a function. */
  falloff?: Ease;
}
/** The marks a layer paints for a time; each call adds a mark and returns the painter. */
export interface ShadePainter {
  /** Along the line from `from` to `to`, `width` px to each side ('both', the default), or to one ('left' or 'right', walking from `from` to `to`), falling off away from the line. */
  band(mark: ShadeMarkOptions & { from: [number, number]; to: [number, number]; width: number; side?: 'both' | 'left' | 'right' }): ShadePainter;
  /** From the point `at` out to `radius` px, falling off outward; with invert, rising outward and full past the radius (a sphere's shading, clipped to it). */
  glow(mark: ShadeMarkOptions & { at: [number, number]; radius: number; invert?: boolean }): ShadePainter;
  /** Inward from the outline of its clip (required), `width` px deep. */
  edge(mark: ShadeMarkOptions & { width: number; clip: ShadeClip }): ShadePainter;
  /** Along the SVG path data `d`, full on it and falling off over `width` px to each side ('both', the default), or to one ('left' or 'right', walking along the path): a shade along a flat shape's side, or a stripe. */
  path(mark: ShadeMarkOptions & { d: string; width: number; side?: 'both' | 'left' | 'right' }): ShadePainter;
  /** Its amount everywhere in its clip. */
  fill(mark: ShadeMarkOptions): ShadePainter;
  /** The escape hatch: paint the field yourself, the ink as colour and the density as alpha. In crachis and ink, `ink` (required there) names the ink and fn paints its density as alpha. */
  paint(fn: (ctx: CanvasRenderingContext2D, t: number) => void, options?: { clip?: ShadeClip; ink?: string }): ShadePainter;
  /** Marks as data: { band: {…}, falloff, amount, ink, clip }, { glow: {…} }, { edge: {…} }, { path: {…} }, { fill: 0.3 }, { paint: fn }. */
  marks(list: ShadeMark[]): ShadePainter;
}
export type ShadeMark = (ShadeMarkOptions & (
  { band: { from: [number, number]; to: [number, number]; width: number; side?: 'both' | 'left' | 'right' } }
  | { glow: { at: [number, number]; radius: number; invert?: boolean } }
  | { edge: { width: number } }
  | { path: { d: string; width: number; side?: 'both' | 'left' | 'right' } }
  | { fill: number }
)) | { paint: (ctx: CanvasRenderingContext2D, t: number) => void; clip?: ShadeClip; ink?: string };
/** A drawing's ink: its tool (pencil by default) and colour (the tool's own by default). */
export interface DrawInk { tool?: 'pencil' | 'pen' | 'ballpoint'; color?: string }

/** What every stroke takes: its ink's name, pressure, a pinned start time, and a group for timeOf(). */
export interface DrawStrokeOptions { ink: string; pressure?: number; at?: number; group?: string }

/** A line: SVG path data `d` (each subpath a stroke) or `points`. */
export type DrawLineOptions = DrawStrokeOptions & ({ d: string; points?: never } | { points: [number, number][]; d?: never });

/** Plans a drawing; each call adds strokes and returns the planner. */
export interface DrawPlanner {
  /** Light, fast planning lines. */
  construct(o: DrawLineOptions): DrawPlanner;
  /** An outline, drawn twice a little apart unless `twice: false`. */
  contour(o: DrawLineOptions & { twice?: boolean }): DrawPlanner;
  /** Parallel lines across a clip, `angle` in degrees (-50), `spacing` px apart (7); `cross` adds a second layer. */
  hatch(o: DrawStrokeOptions & { clip: ShadeClip; angle?: number; spacing?: number; cross?: boolean }): DrawPlanner;
  /** One firm line. */
  accent(o: DrawLineOptions): DrawPlanner;
  /** Text written letter by letter from the baseline's start, `letter` s a letter (0.11). */
  text(o: DrawStrokeOptions & { text: string; font: string; x: number; y: number; letter?: number }): DrawPlanner;
  /** A wait before the next stroke, in s. */
  pause(s: number): DrawPlanner;
}

export interface DrawOptions {
  scene?: SceneContext;
  inks: Record<string, DrawInk>;
  strokes: (s: DrawPlanner) => void;
  /** When the first stroke starts, s (0). */
  start?: number;
  /** When the last stroke ends, s: the hand is paced to it. */
  end?: number;
  /** Show the whole drawing at once (false). */
  drawn?: boolean;
  /** A paper colour, blended normally; none (the default) multiplies the ink onto what is under the canvas. */
  paper?: string | null;
  /** The hand's wander, 0 or more (1). */
  wobble?: number;
  /** The hand's pressure, above 0 (0.85). */
  pressure?: number;
  /** The hand's speed, above 0 (1). */
  speed?: number;
  /** How much the paper's tooth breaks a line, 0 to 1 (0.7). */
  tooth?: number;
  /** The tip's size, above 0 (1). */
  lead?: number;
  /** The noise's seed, a whole number (7). */
  seed?: number;
}

export interface DrawSheet {
  /** When the last stroke ends, s. */
  readonly duration: number;
  /** The start and end of a group's strokes (of the whole drawing without one), or null. */
  timeOf(group?: string): { start: number; end: number } | null;
  /** New options; the drawing is planned and baked again. */
  set(params: Partial<Omit<DrawOptions, 'scene'>>): DrawSheet;
  /** The strokes planned and baked again. */
  redraw(): DrawSheet;
  dispose(): void;
}

/** How a layer moves with its marks between scatters (see shade()). */
export interface ShadeMove { x?: number; y?: number; scale?: number; rotate?: number; origin?: [number, number] }
export type ShadeKind = 'stipple' | 'splatter' | 'halftone' | 'dither' | 'light' | 'grain' | 'crachis' | 'ink';
/** A CSS mix-blend-mode, for a layer drawn over what is under it. */
export type ShadeBlend = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity' | 'plus-lighter';
/** The two kinds only shade() draws: light (the field itself in its ink) and grain (noise as strong as the field). */
interface ShadeOwnKinds {
  light: {};
  grain: {
    /** The grain's size in CSS px (1). */
    scale?: number;
  };
  /** Each ink (at most four) sprayed as drops, coverage 0.918 times the density, overprinted inks multiplied, the drops still unless fps is set. */
  crachis: {
    /** The drops' size in CSS px (1.6): a drop's radius is 0.55 dots, plus a random share of spread that makes some larger, at most 7 dots. */
    dot?: number;
    /** How far the drop sizes spread past the smallest, 0 or more (0.6). */
    spread?: number;
  };
  /** Each ink (at most four) smooth, the inks absorbing light as their densities add, in linear light, on white. */
  ink: {};
}
/** blur()'s options. */
export interface BlurOptions extends LayerScene {
  /** The blur where the field is full, px (8). */
  radius?: number;
  /** Steps a second for freeze: 'all' (0). */
  fps?: number;
  /** Seconds before the steps start (0). */
  delay?: number;
  /** 'seed' (the default): the mask follows the marks every frame. 'all': painted at each step's start, with fps above 0. */
  freeze?: 'seed' | 'all';
  /** Called before each draw with the time to paint; adds the marks for it, in px from the element's top left. */
  marks: (m: ShadePainter, t: number) => void;
}
/** A variable font's outlines as the outline baker writes them (format 1). */
export interface Outlines {
  format: 1;
  family: string;
  upm: number;
  ascender: number;
  descender: number;
  capHeight: number;
  xHeight: number;
  /** The kept axes (wght, slnt), each with its avar map and the stops its glyphs are kept at. */
  axes: Array<{ tag: string; min: number; default: number; max: number; avar: Array<[number, number]>; stops: number[] }>;
  /** Each character's commands, and its advance and points at each grid point. */
  glyphs: Record<string, { cmds: string; adv: number[]; pts: number[][] }>;
  /** Each pair that kerns at the default setting or at a corner of the grid, its adjustment at each grid point. */
  kern: Record<string, number[]>;
  /** The characters the font does not have. */
  missing: string[];
  /** The largest difference found from the font's own outlines, font units. */
  error: number;
}
/** A line's options. */
export interface TextLineOptions {
  /** The line's point, [x, y] px from the canvas's top left ([0, 0]). */
  at?: [number, number];
  /** px (16). */
  size?: number;
  /** 'left' (the default), 'center' or 'right'. */
  align?: 'left' | 'center' | 'right';
  /** 'baseline' (the default): y is the baseline. 'middle': y is the middle of the capitals. */
  valign?: 'baseline' | 'middle';
  /** em between letters (0). */
  tracking?: number;
  /** 'natural' (the default): each letter at its own advance and kerning. 'fixed': each in the slot of its default advance, centred, with no kerning. */
  spacing?: 'natural' | 'fixed';
  /** The letters' colour ('#000'). */
  color?: string;
  /** The weight for the whole line. */
  wght?: number;
  /** The slant for the whole line, degrees; on a font with no slnt axis it skews the letters. */
  slnt?: number;
}
/** One letter's own values, which replace the line's. */
export interface TextLetter {
  wght?: number;
  slnt?: number;
  /** px. */
  dx?: number;
  /** px. */
  dy?: number;
  /** About the letter's middle (1). */
  scale?: number;
  /** Degrees, about the letter's middle. */
  rotate?: number;
  /** 0 to 1 (1); at 0 the letter still takes its space. */
  opacity?: number;
  /** px. */
  blur?: number;
  color?: string;
}
export interface TextPainter {
  /** Adds a line; letter(i, ch) returns that letter's own values. */
  line(text: string, options?: TextLineOptions, letter?: (i: number, ch: string) => TextLetter | void): TextPainter;
}
/** text()'s options. */
export interface TextOptions extends LayerScene {
  /** The outlines the baker writes. */
  font: Outlines;
  /** Called before each draw with the time; adds the lines with m.line(). */
  lines: (m: TextPainter, t: number) => void;
}
export interface TextLayer {
  /** Swaps the outlines, the lines function, or both. */
  set(options: Partial<Omit<TextOptions, 'scene'>>): TextLayer;
  /** Stops drawing. A text() made with `scene` is disposed with the scene. */
  dispose(): void;
}
/** boil()'s options. */
export interface BoilOptions {
  /** About the largest move, px (2). */
  amount?: number;
  /** The length along the outline over which the noise changes once, px (30). */
  scale?: number;
  /** Steps a second, with t; 0 (the default) keeps one seed. */
  fps?: number;
  /** Seconds of t before the steps start (0): the first seed holds until then, and the next comes 1 / fps s after. */
  delay?: number;
  /** The time, s, for the steps. */
  t?: number;
  /** The first step's seed, a whole number (1). */
  seed?: number;
  /** The distance between samples, px (2). */
  detail?: number;
}
export interface BlurLayer {
  /** Changes radius, fps, delay, freeze or marks; values all as they were change nothing. KN-100 for anything else. */
  set(params: Partial<Omit<BlurOptions, 'scene'>>): BlurLayer;
  /** Paints the marks again at the next draw, for marks that read something that changed under freeze: 'all'. */
  redraw(): BlurLayer;
  /** Takes the blur and the mask off the element. A blur made with `scene` is disposed with the scene. */
  dispose(): void;
}
/** shade()'s options: the layer's own, then its kind's parameters (as effect()'s, or for light and grain their own, without ink, paper or color). */
export type ShadeOptions<K extends ShadeKind = 'stipple'> = {
  /** 'stipple' (the default), 'splatter', 'halftone', 'dither', 'light' (the field itself, smooth, blended by screen), 'grain' (noise as strong as the field, blended by overlay, a new pattern fps times a second; fps at the frame rate for film grain), 'crachis' (each ink sprayed as drops that overprint) or 'ink' (each ink smooth, mixed as printing ink mixes); crachis and ink print at most four inks and multiply onto what is under them. */
  kind?: K;
  /** The canvas's CSS mix-blend-mode: 'screen' for light, 'overlay' for grain, 'multiply' for crachis and ink, 'normal' for the rest by default. */
  blend?: ShadeBlend;
  /** Called before each draw with the time to paint (the scene's local time with `scene`, else the composition time); adds the marks for it. Every layer needs it. */
  marks: (m: ShadePainter, t: number) => void;
  /** A new scatter this many times a second, held between; 0 (the default) keeps one. Halftone, dither and light have no noise and take its steps for their freezes. */
  fps?: number;
  /** Seconds of the layer's time before the boil starts (0): the layer holds its first scatter until then, and the next comes 1 / fps s after. */
  delay?: number;
  /** 'seed' (the default): the marks are painted for every frame and the seed is kept. 'all': the marks are painted for the step's start only, so the whole texture holds still and jumps. Needs fps above 0. */
  freeze?: 'seed' | 'all';
  /** For marks that all move together: painted for the step's start, then the canvas's CSS transform set to move(t) with move(start) undone, so the specks move with the marks. Needs fps above 0. The layer owns the canvas's transform. */
  move?: (t: number) => ShadeMove;
  /** The layer's opacity, 0 to 1 (1). */
  opacity?: number;
  /** The first scatter's seed, a whole number (1). */
  seed?: number;
  /** Cuts what the layer draws to a shape, in the canvas's px: a speck, drop or dot crossing its outline is cut there (a mark's clip only limits where its density is painted). null in set() takes it off. Under move, it moves with the canvas. */
  mask?: ShadeClip | null;
} & LayerScene & (K extends 'stipple' | 'splatter' | 'halftone' ? {
  /** More ink everywhere (toward 1) or less (toward -1), 0 by default, as effect()'s density. */
  density?: number;
} : {}) & Omit<(EffectParams & ShadeOwnKinds)[K], 'ink' | 'paper' | 'color' | 'density'>;
export interface ShadeLayer<K extends ShadeKind = ShadeKind> {
  /** Changes the layer's marks, blend, fps, delay, freeze, move (null stops it and clears the canvas's transform), opacity, seed, density or mask, or its kind's parameters; the next seek draws with them. Values all as they were change nothing and paint nothing (a mask given again as the same shape is no change; a new move or marks function is). KN-100 for kind, ink, paper or color. */
  set(params: Partial<Omit<ShadeOptions<K>, 'kind' | 'move' | 'scene'>> & { move?: ((t: number) => ShadeMove) | null }): ShadeLayer<K>;
  /** Paints the marks again at the next draw, for a frozen layer (freeze: 'all' or move) whose marks read something that changed. */
  redraw(): ShadeLayer<K>;
  /** Stops drawing and releases the canvas's WebGL context. A layer made with `scene` is disposed with the scene. */
  dispose(): void;
}

/**
 * What lottie() calls and reads on an animation. lottie-web's AnimationItem
 * has all of it; any object with these members works.
 */
export interface LottieAnimation {
  /** Called as goToAndStop(frame, true) on every seek once loaded. */
  goToAndStop(value: number, isFrame?: boolean): void;
  /** Listened to for DOMLoaded, data_failed, error and destroy; a function it returns stops the listening. */
  addEventListener(name: 'DOMLoaded' | 'data_failed' | 'error' | 'destroy', callback: (event?: any) => void): (() => void) | void;
  /** Called with true, when there is one. */
  setSubframe?(useSubFrames: boolean): void;
  /** false until loaded; an object without it is taken as loaded. */
  isLoaded?: boolean;
  totalFrames: number;
  frameRate: number;
  /** Names the animation in KN-180's message. */
  name?: string;
  /** With fileName, the file in KN-180's message: path + fileName + '.json', as lottie-web sets them. */
  path?: string;
  fileName?: string;
}
export interface LottieOptions extends LayerScene {
  /** Seconds at which the animation is on its first frame, which it holds before (0). */
  start?: number;
  /** The animation's seconds per second, above 0 (1). */
  rate?: number;
  /** true starts it again at its end; false (the default) holds its last frame. */
  loop?: boolean;
}
/** The handle lottie() returns. */
export interface LottieHandle {
  /** Hands the animation back: Kinetic no longer seeks it, listens to it or waits for it. Again after that does nothing. */
  dispose(): void;
}
/**
 * The handle animatedImage() returns. Frames last as long as the file says,
 * a frame of 10 ms or less 100 ms; before 0 the first frame shows, and past
 * the end it plays as browsers play the file (for ever, or n + 1 times when
 * it repeats n times, then holding the last frame). loop: true wraps for
 * ever; loop: false holds the last frame after one play.
 */
export interface AnimatedImage {
  /** Seconds of one play-through; 0 until decoded. */
  readonly duration: number;
  /** The number of frames; 0 until decoded. */
  readonly frames: number;
  /** The index of the frame on screen t seconds in; 0 until decoded. KN-100 for a t that is not a finite number or a bad option. */
  frameAt(t: number, options?: { loop?: boolean }): number;
  /**
   * Clears the canvas and draws the frame for t over all of it, stretched to
   * its width and height whatever the context's transform (its alpha and
   * composite mode are the page's); nothing until decoded. KN-100 for a
   * target that is not a canvas or has a WebGL context, a bad t or a bad option.
   */
  draw(canvas: HTMLCanvasElement, t: number, options?: { loop?: boolean }): void;
}
export type TransitionDirection = 'from-left' | 'from-right' | 'from-top' | 'from-bottom' | 'clockwise' | 'anticlockwise';

/** Inline styles for one side of a transition; only the properties the kind uses are present. */
export interface TransitionStyle {
  opacity?: number;
  /** e.g. '50% 0%': percentages of the element's own box. */
  translate?: string;
  scale?: number;
  /** e.g. 'y 45deg'. */
  rotate?: string;
  clipPath?: string;
  filter?: string;
  zIndex?: number;
}

export interface TransitionStyles {
  in: TransitionStyle;
  out: TransitionStyle;
}

export interface SplitRow {
  i: number;
  key: number;
  text: string;
  space: boolean;
}

export interface RankedRow<T> {
  row: T;
  index: number;
  value: number;
  /** 0 is first; fractional between two keyframes. */
  position: number;
}

/** One word of `npx hyperframes transcribe` output. */
export interface TranscriptWord {
  id?: string;
  text: string;
  start: number;
  end: number;
}

/** An option left out, or passed as undefined, takes its default. */
export interface CaptionOptions {
  /** Default 5. */
  maxWords?: number;
  /** Default 40. */
  maxChars?: number;
  /** Seconds of silence that start a new line. Default 1. */
  maxGap?: number;
  /** A word ending in . ! or ? ends its line. Default true. */
  sentences?: boolean;
  /** Seconds a line stays after its last word, until the next line starts. Default 0.4. */
  hold?: number;
}

export interface CaptionWord extends TranscriptWord {
  key: string | number;
  state: 'past' | 'active' | 'future';
  /** The word's own progress, 0..1. */
  p: number;
}

export interface CaptionLine {
  index: number;
  start: number;
  end: number;
  text: string;
  words: CaptionWord[];
  /** True between lines and before the first: `words` is then []. */
  empty: boolean;
}

export interface TextMetricsLetter extends SplitRow {
  /** The grapheme's left edge from the line's start, tracking included. */
  x: number;
  /** Its advance, kerning with the next included. */
  width: number;
}

export interface TextMetricsResult {
  width: number;
  /** The ink's extent left of the line's start, right of it, above the baseline and below it, in px. */
  left: number;
  right: number;
  ascent: number;
  descent: number;
  /** With `width`: the font size in px at which the line is that wide. */
  size?: number;
  /** With `letters: true`. */
  letters?: TextMetricsLetter[];
}

/** A row of a timing table for moment(): the seconds it starts, and optionally ends; any other fields are the author's. */
export interface MomentRow {
  at: number;
  end?: number;
}

export interface MomentState<T> {
  /** The row's place in time order, for data-key. */
  key: number;
  row: T;
  state: 'past' | 'active' | 'future';
  /** 0 to 1 through the row; 0 while a row with no end is active. */
  p: number;
}

export interface Moment<T> {
  /** The current row's place in time order; -1 when empty. */
  index: number;
  row: T | null;
  start: number;
  /** Its own end, the next row's at, or Infinity for the last. */
  end: number;
  /** Seconds since the row started. */
  since: number;
  p: number;
  /** The row after the current one, or when empty the row to come; null after the last. */
  next: T | null;
  /** True before the first row and in a gap after a row's end. */
  empty: boolean;
  rows: MomentState<T>[];
}

export interface Beat {
  time: number;
  /** 0..1; 0.5 when absent. */
  strength?: number;
}

/** A HyperFrames beat file. */
export interface BeatFile {
  version: 1;
  audio?: string;
  beats: Beat[];
}

/** An audio clip's beat grid, from tempo(). */
export interface Tempo {
  /** Beats per minute, as the clip declares. */
  bpm: number;
  /** A beat's length in composition seconds, at the clip's playback rate. */
  beat: number;
  /** Beats to a bar. */
  meter: number;
  /** The composition time of beat n; 0 is the downbeat, and fractions and negatives are allowed. */
  at(n: number): number;
  /** The beat at composition time t; Math.floor(of(t) / meter) is the bar. */
  of(t: number): number;
}

/*
 * Embedding. With `embed` in the page's URL (index.html?embed) the page
 * shows the composition alone, and inside another page's <iframe> it takes
 * these messages from its parent through postMessage, from any origin, and
 * posts the ones below back with '*'. It takes commands from its parent
 * only; without `embed` in the URL, or at the top of a window, it posts and
 * takes nothing.
 */

/** Plays: play(), or play({ from, to }) with either given. */
export interface KineticEmbedPlay {
  type: 'kinetic:play';
  /** Seconds to seek to first. */
  from?: number;
  /** Seconds at which it stops, holding the last frame before. */
  to?: number;
}
/** Pauses. */
export interface KineticEmbedPause {
  type: 'kinetic:pause';
}
/** Seeks to `time`, in seconds; a time that is not a number is answered with kinetic:error and changes nothing. */
export interface KineticEmbedSeek {
  type: 'kinetic:seek';
  time: number;
}
/** Asks for a kinetic:time message now. */
export interface KineticEmbedState {
  type: 'kinetic:state';
}
/** A message the host page sends to the frame: frame.contentWindow.postMessage(command, '*'). */
export type KineticEmbedCommand = KineticEmbedPlay | KineticEmbedPause | KineticEmbedSeek | KineticEmbedState;

/** Posted once readiness has settled. */
export interface KineticEmbedReady {
  type: 'kinetic:ready';
  /** 'true' when readiness passed, 'failed' when it failed. */
  ready: 'true' | 'failed';
  /** Seconds; 0 when unknown. */
  duration: number;
  fps: number;
  /** The root's data-width and data-height, in px; 0 when absent. */
  width: number;
  height: number;
}
/** Posted after every seek, play and pause, and in answer to kinetic:state: the clock store's fields. */
export interface KineticEmbedTime {
  type: 'kinetic:time';
  /** Composition seconds. */
  time: number;
  frame: number;
  playing: boolean;
  /** Seconds; 0 when unknown. */
  duration: number;
  fps: number;
}
/** Posted for a seek whose time is not a number, or a play the clock refused; the command changed nothing. */
export interface KineticEmbedError {
  type: 'kinetic:error';
  /** The KN-100 error's message. */
  message: string;
}
/** A message the frame posts to the host page, read in its message listener as e.data (check e.source is the frame). */
export type KineticEmbedMessage = KineticEmbedReady | KineticEmbedTime | KineticEmbedError;
