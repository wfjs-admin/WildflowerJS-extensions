# @wildflowerjs/threads

Runs a WildflowerJS store on a Web Worker. You declare state, computed
properties and methods once with `wildflower.thread()`. The worker runs them
as a store, and the page gets a store of the same name, which the worker's
patches keep up to date.

Documentation: https://www.wildflowerjs.com/docs/threads/

## Use

Serve `dist/threads.wf.min.js` (or `dist/threads.wf.js`, the development
build) from your site and load three classic scripts, the framework first.

```html
<script defer src="/js/wildflower.min.js"></script>
<script defer src="/js/threads.wf.min.js"></script>
<script defer src="/js/stats.js"></script>
```

`stats.js` is the definition file. It runs on both sides. On the page it
registers the store, and in the worker it becomes the store the worker runs.

```js
wildflower.thread('stats', {
  state: { rows: [], params: { query: '' } },
  computed: {
    filtered() { return this.rows.filter(r => r.name.includes(this.params.query)); },
    count()    { return this.filtered.length; }
  },
  async load(url) { this.rows = await (await fetch(url)).json(); }
});
```

On the page it is a store like any other.

```html
<div data-component="dashboard">
  <input data-model="stats.params.query">
  <span data-bind="$stats.count"></span> rows
</div>
```

`$stats.count` in a binding, `subscribe: ['stats']`, `this.stores.stats`,
`data-list="$stats.filtered"`, `watch: { 'store:stats.count': ... }` and
`data-model="stats.params.query"` all work as they do for any store, and so
does `wildflower.getStore('stats')`. The store's state is the definition's
state fields, one field per computed, and `isLoading`, `error` and `pending`.
Methods are store methods that return promises, so
`await wildflower.getStore('stats').load('/api/rows.json')` waits for the
worker's answer, and `settled()` resolves once every write and call made so
far has been acknowledged. `wildflower.unregister('stats')` and
`wildflower.destroy()` terminate the worker. On tiers that include plugins
the extension registers through `wildflower.plugin()`, and on the others it
adds `wildflower.thread` directly. It adds nothing else to the framework.

## Fields and state

`isLoading` is true until the first patch arrives. `error` holds the last
worker failure, and `pending` counts messages not yet acknowledged. The
worker owns these and the computed fields, so a write to one of them from the
page is dropped. A write to a state field is sent to the worker only when it
changes the field's value.

Writes that arrive while the worker is busy are applied together, so a burst
costs one recompute for the newest input, and every message is still
acknowledged in order. A `tick(dt)` in the definition runs in the worker on
its own timer, about 60 times a second, with `dt` in milliseconds. The timer
uses `setTimeout`, so a hidden tab does not stop it.

`workerOnly: ['rows', 'filtered']` keeps the listed state and computeds in the
worker. They are reactive there and never sent to the page, and the page's
store has no field for them. In the example above, the rows stay in the
worker and `count`, computed from them, is still sent. Worker-only state is
tracked by identity and read without per-element proxies, so replace it
(`this.rows = this.rows.concat(row)`) instead of changing it in place. A
development build warns (TH-109) when a worker-only array is changed in place.

State whose name starts with an underscore, such as `_positions`, carries
per-frame output from the worker to the page. It is not reactive on either
side. The worker sends the whole value whenever its identity changes, and the
page reads it when it needs it. A typed array there is transferred rather
than copied, so allocate a new one each tick, because the worker's copy is
detached once it has been sent.

## The worker side

The worker loads the same framework file as the page, found among the page's
script tags, or the one you pass as `{ core: url }`. There it runs without a
document, so it scans nothing and adds no listeners. The definition is
registered with `wildflower.store()`, so lifecycle hooks, `this` and computed
properties behave as they do in any store. A store has no `watch` block, and a
thread has none either. Watch a thread from the page, with `store.subscribe()`
or a component's `watch: { 'store:name.field' }`. The extension uses only the
framework's public API, so it works with every tier, development or
production.

A definition declared in page code can use the inline form,
`wildflower.thread(name, def, { inline: true })`. It turns the definition into
a Blob worker, so a `worker-src` policy has to allow `blob:`.

With the default form, the extension file served from your own origin works
under `script-src 'self'; worker-src 'self'`. Loaded from another origin, such
as a CDN, it starts the worker from a `blob:` URL, because browsers refuse a
worker script from another origin, so `worker-src` has to allow `blob:` there
too.

## Diagnostics

The extension's warnings and errors carry codes prefixed `TH`.

- TH-101: a value cannot cross to the worker. The message gives its path and type.
- TH-102: the page wrote to a field the worker or the runtime owns, such as a computed, `isLoading`, `error` or `pending`.
- TH-103: the worker failed to start. For the inline form and a cross-origin load, the message says that `worker-src` has to allow `blob:`.
- TH-104: a call was cancelled because the thread was unregistered.
- TH-105: a problem with the definition.
- TH-106: there is no URL to start the worker from.
- TH-107: there is no framework script for the worker to load.
- TH-108: the extension file was loaded on a page with no framework instance.
- TH-109: a worker-only array was changed in place.
- TH-110: the worker has not answered for five seconds.

## TypeScript

`types.d.ts` derives the store's fields from the definition. A computed's
return type is the field's type, a method returns a promise of its own return
type, and a name in `workerOnly` is absent. To type `wildflower.thread` on a
page that loads the files by script tag, add
`/// <reference types="@wildflowerjs/threads/types.global" />`.

## License

MIT
