/**
 * @wildflowerjs/threads TypeScript definitions
 *
 * A thread is a store that runs on a Web Worker. The page reads a mirror of
 * it. These types derive that mirror from the definition you write: a
 * computed property's return type is the type of the field the page reads, a
 * method returns a promise of its own return type, and a name listed in
 * `workerOnly` is absent from the mirror entirely.
 *
 * The built files are IIFEs that add `wildflower.thread`, so import this
 * file for types, or reference `types.global.d.ts` to type
 * `wildflower.thread` itself.
 *
 * @license MIT
 */

// =============================================================================
// DEFINITION
// =============================================================================

/** Keys of a definition that are not callable methods on the mirror. */
export type ThreadReservedKey =
  | 'state'
  | 'computed'
  | 'workerOnly'
  | 'watch'
  | 'init'
  | 'beforeInit'
  | 'beforeUpdate'
  | 'onUpdate'
  | 'beforeDestroy'
  | 'destroy'
  | 'onError'
  | 'onStoreUpdate'
  | 'tick';

/** Names the mirror uses for itself; a definition may not reuse them (TH-105). */
export type ThreadReservedName =
  | 'name'
  | 'isLoading'
  | 'error'
  | 'pending'
  | 'snapshot'
  | 'subscribe'
  | 'settled'
  | 'terminate'
  | 'addEventListener'
  | 'removeEventListener'
  | 'dispatchEvent';

/**
 * The shape every definition satisfies. `state` holds the inputs the page may
 * write and, with a leading underscore, the raw per-frame channel. `computed`
 * holds the outputs. Anything else that is a function is a method, callable
 * from the page and answered with a promise.
 *
 * Write a definition as an object literal rather than annotating it with this
 * type: the entry points infer from the literal, which is what gives the
 * mirror its field types.
 */
export interface ThreadDefinitionShape {
  /** Initial state. Underscore-prefixed keys are the non-reactive raw channel. */
  state: Record<string, any>;

  /** Computed properties, evaluated in the worker. */
  computed?: Record<string, (...args: any[]) => any>;

  /**
   * State keys and computed names that live in the worker only: reactive
   * there, never mirrored, absent from the page's store. Worker-only state
   * is replaced, never mutated in place (TH-109).
   */
  workerOnly?: readonly string[];

  /** Watchers, as on any store. */
  watch?: Record<string, (newValue: any, oldValue: any, path: string) => void>;

  /** Lifecycle hooks, run in the worker. */
  init?: () => void | Promise<void>;
  beforeInit?: () => void;
  beforeDestroy?: () => void;
  destroy?: () => void;
  onError?: (error: Error) => void;

  /**
   * A loop in the worker, on its own timer, about sixty times a second.
   * `dt` is milliseconds since the previous tick. The page cannot call it.
   */
  tick?: (dt: number) => void;

  /** Methods. Called from the page; each returns a promise there. */
  [key: string]: any;
}

// =============================================================================
// DERIVING THE MIRROR FROM THE DEFINITION
// =============================================================================

/** The definition's `state` type. */
export type ThreadStateOf<TDef> = TDef extends { state: infer S } ? S : {};

/** The definition's `computed` block. */
export type ThreadComputedOf<TDef> = TDef extends { computed: infer C } ? C : {};

/** The value of each computed property: what the page reads. */
export type ThreadComputedValues<TComputed> = {
  [K in keyof TComputed]: TComputed[K] extends (...args: any[]) => infer R ? Awaited<R> : never;
};

/** The definition's methods as written, for `this` inside the worker. */
export type ThreadOwnMethods<TDef> = {
  [K in Exclude<keyof TDef, ThreadReservedKey> as TDef[K] extends (...args: any[]) => any ? K : never]: TDef[K];
};

/** The definition's methods as the page calls them: each answered with a promise. */
export type ThreadMethods<TDef> = {
  [K in Exclude<keyof TDef, ThreadReservedKey> as TDef[K] extends (...args: any[]) => any
    ? K
    : never]: TDef[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never;
};

/**
 * `this` inside a definition's computeds, methods and hooks: the state, the
 * computed values, and the other methods, as in any store.
 */
export type ThreadContext<TDef> = ThreadStateOf<TDef> &
  ThreadComputedValues<ThreadComputedOf<TDef>> &
  ThreadOwnMethods<TDef>;

/** The three fields the runtime keeps on every mirror. */
export interface ThreadRuntimeFields {
  /** True from creation until the worker's first answer. */
  readonly isLoading: boolean;
  /** Writes and calls sent but not yet acknowledged. */
  readonly pending: number;
  /**
   * The message of the last failure from the worker, or null. Cleared by the
   * next acknowledged message, as a query store's `error` is cleared by the
   * next successful sync. The Error itself, carrying `name`, `stack` and
   * `thread`, is what the failing call's promise rejects with.
   */
  readonly error: string | null;
}

/** What a thread's store and mirror both answer to. */
export interface ThreadSettleable {
  /** Resolves once every write and call made so far has been acknowledged. */
  settled(): Promise<void>;
}

/**
 * The page's view of a thread: the inputs it may write, the outputs the
 * worker pushes back, the methods, and the runtime fields. Everything named
 * in `workerOnly` is absent.
 */
export type ThreadMirrorOf<TDef, TWorkerOnly extends string = never> = Omit<ThreadStateOf<TDef>, TWorkerOnly> &
  Omit<ThreadComputedValues<ThreadComputedOf<TDef>>, TWorkerOnly> &
  ThreadMethods<TDef> &
  ThreadRuntimeFields &
  ThreadSettleable;

// =============================================================================
// EVENTS
// =============================================================================

/** The detail carried by `thread:patch` on `document`. */
export interface ThreadPatchDetail {
  /** The thread's name. */
  name: string;
  /** The message this change set answers, or 0 when it answers none. */
  seq: number;
  /** Each changed path and its new value. */
  changes: Array<{ path: string; value: any }>;
  /** 'patch' from the worker, 'local' for your own write, 'meta' for bookkeeping. */
  source: 'patch' | 'local' | 'meta';
  fromWorker: boolean;
}

// =============================================================================
// OPTIONS
// =============================================================================

export interface ThreadOptions {
  /** The framework file for the worker to load; default: the page's own script tag. */
  core?: string;
  /** The definition file's URL, when `wildflower.thread()` is not called from its top level. */
  def?: string;
  /** This extension's own URL, when it was not loaded through a classic script tag. */
  url?: string;
  /** Serialise the definition into a Blob worker. Refused where worker-src lacks blob:. */
  inline?: boolean;
}

// =============================================================================
// ENTRY POINTS
// =============================================================================

/**
 * `wildflower.thread(name, definition, options)`: create a thread and register
 * it as a store under its name, so `$name` bindings, `subscribe: [name]` and
 * `wildflower.getStore(name)` all reach it.
 *
 * @example
 * const orders = wildflower.thread('orders', {
 *     state: { rows: [] as Order[], params: { query: '' } },
 *     workerOnly: ['rows'],
 *     computed: { count(): number { return this.rows.length; } },
 *     async load(url: string) { this.rows = await (await fetch(url)).json(); }
 * });
 * orders.count;            // number
 * orders.params.query = 'smith';
 * await orders.load('/api/orders.json');
 */
export declare function wildflowerThread<
  TDef extends ThreadDefinitionShape,
  const TWorkerOnly extends readonly string[] = readonly []
>(
  name: string,
  definition: TDef & { workerOnly?: TWorkerOnly } & ThisType<ThreadContext<TDef>>,
  options?: ThreadOptions
): ThreadMirrorOf<TDef, TWorkerOnly[number]>;

/** The diagnostic codes the extension raises. See the Error Codes page. */
export type ThreadDiagnosticCode =
  | 'TH-101'
  | 'TH-102'
  | 'TH-103'
  | 'TH-104'
  | 'TH-105'
  | 'TH-106'
  | 'TH-107'
  | 'TH-108'
  | 'TH-109'
  | 'TH-110'
  | 'TH-111'
  | 'TH-112';

export default wildflowerThread;
