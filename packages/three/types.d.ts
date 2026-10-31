/**
 * @wildflowerjs/three TypeScript definitions
 *
 * A view is a store that draws a three.js scene. These types describe the
 * view's options, its store state and its methods. three.js objects are typed
 * loosely (the extension never imports three.js, and a page may use any
 * version from 0.160); cast to your own `three` types where you need them.
 *
 * The built files are IIFEs that add `wildflower.three`, so import this file
 * for types, or reference `types.global.d.ts` to type `wildflower.three`.
 *
 * @license MIT
 */

// =============================================================================
// THREE.JS OBJECTS (structural, version-independent)
// =============================================================================

export interface ThreeRenderer { domElement: HTMLCanvasElement; render(scene: unknown, camera: unknown): void; [k: string]: any; }
export interface ThreeScene { traverse(fn: (obj: any) => void): void; [k: string]: any; }
export interface ThreeCamera { position: { x: number; y: number; z: number }; [k: string]: any; }
export interface ThreeInstancedMesh { isInstancedMesh: true; count: number; renderOrder: number; [k: string]: any; }

// =============================================================================
// VIEW
// =============================================================================

export interface Inset { left?: number; right?: number; top?: number; bottom?: number; }

/** A three.js Sphere or Box3 (structural: anything with `isSphere` or `isBox3`). */
export interface ThreeShape { isSphere?: true; isBox3?: true; containsPoint(p: any): boolean; [k: string]: any; }
/** A three.js Object3D to raycast against. */
export interface ThreeObject { isObject3D: true; [k: string]: any; }
export interface ThreeVideoTexture { isTexture: true; image: HTMLVideoElement; [k: string]: any; }

export type Occluder =
  | ThreeShape
  | { x?: number; y?: number; z?: number; radius: number }
  | ThreeObject
  | ThreeObject[]
  | ((x: number, y: number, z: number) => boolean);

export interface ViewOptions {
  renderer: ThreeRenderer;
  scene: ThreeScene;
  camera: ThreeCamera;
  /** Size the renderer, pixel ratio and camera aspect to this element. */
  fit?: Element;
  /** Centre the scene in the area this inset leaves free, in CSS px. */
  inset?: Inset | (() => Inset | null) | null;
  /**
   * Picking and follow() skip what is behind this, in world space: a three.js
   * Sphere or Box3, a sphere literal, one or more objects to raycast against
   * (their real shape), or your own test.
   */
  occluder?: Occluder;
  /** Called at the start of each frame. */
  before?: () => void;
  /**
   * Replaces the view's own `renderer.render(scene, camera)` call, for a
   * post-processing pass such as an EffectComposer: called with the renderer,
   * the scene and the camera whenever the view draws a frame.
   */
  draw?: (renderer: ThreeRenderer, scene: unknown, camera: unknown) => void;
  /** Cap on the pixel ratio when `fit` is set. Default 2. */
  maxPixelRatio?: number;
  /** false keeps the scene's GPU resources on unregister. */
  dispose?: boolean;
  /**
   * 'frame' (the default) draws every frame. 'change' draws only after a
   * binding writes, the camera moves, the canvas is resized, or
   * `invalidate()` is called, so a still scene costs almost nothing.
   */
  render?: 'frame' | 'change';
  /** Run the whole frame (before, sync, render) at most this many times a second. */
  maxFps?: number;
}

/** What `hovered` and `selected` hold: a copy of the entity, taken when it changed. */
export interface EntitySnapshot<E = Record<string, unknown>> {
  /** The binding's name. */
  binding: string;
  /** The entity's key: its id, the field `key` names, or its instance index. */
  id: unknown;
  entity: E;
}

export interface ViewState {
  hovered: EntitySnapshot | null;
  selected: EntitySnapshot | null;
  pointer: { x: number; y: number } | null;
  size: { width: number; height: number };
  pixelRatio: number;
  stats: { syncMs: number; renderMs: number; fps: number };
}

// =============================================================================
// BINDINGS
// =============================================================================

type Field<E> = keyof E | ((entity: E) => any);

export interface InstancedSpec<E = any> {
  position: [keyof E, keyof E, keyof E];
  /** The x, y, z, w fields of a rotation quaternion (normalized when drawn). Not with rotation, direction or rotationY (3D-104). */
  quaternion?: [keyof E, keyof E, keyof E, keyof E];
  /** The x, y, z rotation fields in radians, in three.js's 'XYZ' order. Not with quaternion, direction or rotationY (3D-104). */
  rotation?: [keyof E, keyof E, keyof E];
  direction?: [keyof E, keyof E, keyof E];
  rotationY?: Field<E>;
  /** One factor for all three axes, or the x, y, z fields, each along the instance's own axis. */
  scale?: Field<E> | [keyof E, keyof E, keyof E];
  /** 0xRRGGBB, or [r, g, b] in linear space. */
  color?: Field<E>;
  attributes?: Record<string, Field<E> | { field: Field<E>; size: number }>;
  name?: string;
  key?: keyof E;
  /** Re-read an array source every frame (for an array changed in place). */
  live?: boolean;
  pickable?: boolean;
  /**
   * When a pool source is written into the mesh. 'frame' (the default) writes
   * every frame, which suits a pool that tick() animates in place. 'change'
   * writes only after the pool's version goes up (push, remove, clear,
   * update, swap, markDirty), so a pool that sits still costs nothing; a
   * change made in place must be reported with markDirty() or update().
   */
  sync?: 'frame' | 'change';
}

export interface BufferSpec<E = any> {
  stride: number;
  offset?: number | ((arr: ArrayLike<number>) => number);
  count: (arr: ArrayLike<number>) => number;
  position: [number, number, number];
  /** The x, y, z, w offsets of a rotation quaternion within a record; not with direction (3D-105). */
  quaternion?: [number, number, number, number];
  direction?: [number, number, number];
  color?: (index: number) => number | [number, number, number];
  /** The entity picking returns for record i; without it the binding is not picked. */
  entity?: (index: number) => E;
  pickRadius?: number;
  pickFilter?: (index: number, x: number, y: number, z: number) => boolean;
  name?: string;
  key?: keyof E;
  pickable?: boolean;
}

export interface Binding { name: string; mesh: ThreeInstancedMesh; }
export interface BufferBindingHandle extends Binding { /** Rewrite every slot's colour on the next frame. */ recolor(): void; }

export interface Hit<E = any> { entity: E; binding: Binding; index: number; point: { x: number; y: number; z: number }; distance: number; }
export interface Pick<E = any> { entity: E; binding: Binding; name: string; point: { x: number; y: number; z: number }; hits: Hit[]; }

type PointerLike = { clientX: number; clientY: number };

export interface ThreeView extends ViewState {
  instanced<E>(source: { items: E[] } | (() => E[]), mesh: ThreeInstancedMesh, spec: InstancedSpec<E>): Binding;
  buffer<E>(source: () => ArrayLike<number> | null, mesh: ThreeInstancedMesh, spec: BufferSpec<E>): BufferBindingHandle;
  /**
   * A shader parameter that follows the app. `target` is anything with a
   * `value` (a TSL `uniform()` node, a `ShaderMaterial`'s uniforms entry);
   * `source` is read each frame, and a changed value is written (three.js
   * math objects and arrays are copied into the target's own object, and a
   * number is set into a Color target) and drawn under render: 'change'.
   * Returns a function that stops it.
   */
  uniform<T>(target: { value: T }, source: () => T): () => void;
  /**
   * A texture of a `<video>`, uploaded on the next frame after the video's
   * `currentTime` moves (not while it is seeking or has no frame) and drawn
   * under render: 'change'. Returns a function that stops it. 3D-114 for
   * anything but a three.js texture of a `<video>`.
   */
  video(texture: ThreeVideoTexture): () => void;
  pick(event: PointerLike): Pick | null;
  hits(event: PointerLike): Hit[];
  project(entity: any, binding?: Binding): { x: number; y: number } | null;
  /** Through `camera` when given (its matrices brought up to date first), else the view's camera; CSS pixels of the view's canvas. */
  projectPoint(x: number, y: number, z: number, camera?: ThreeCamera): { x: number; y: number } | null;
  follow(element: HTMLElement, getEntity: () => any, binding?: Binding): () => void;
  occluded(x: number, y: number, z: number): boolean;
  resize(): void;
  /** Draw the next frame under render: 'change', for a scene changed by your own code. */
  invalidate(): void;
  /** One frame now, whatever `render` and `maxFps` say: for code that must have the canvas hold this moment before it reads or captures it. Called while the view is drawing (from its `draw` option or `before()`), it does nothing (3D-115). */
  draw(): void;
  /** The renderer's canvas. */
  canvas(): HTMLCanvasElement;
  subscribe(path: string, callback: (value: any, old: any) => void, options?: { immediate?: boolean; once?: boolean }): () => void;
}

export interface WildflowerThree {
  /** Hand the extension the page's three.js module. Returns the API. */
  use(THREE: unknown): WildflowerThree;
  /** Register store `name` as a view and return it. */
  view(name: string, options: ViewOptions): ThreeView;
  /** The live views, as their stores. */
  views(): ThreeView[];
}

export declare const wildflowerThree: WildflowerThree;

/** The extension's diagnostic codes (thrown errors carry one in `code`). */
export type ThreeDiagnosticCode =
  | '3D-101'
  | '3D-102'
  | '3D-103'
  | '3D-104'
  | '3D-105'
  | '3D-106'
  | '3D-107'
  | '3D-108'
  | '3D-109'
  | '3D-110'
  | '3D-111'
  | '3D-112'
  | '3D-113'
  | '3D-114'
  | '3D-115';
