# WildflowerJS extensions

An extension is a separate file that a page loads after the framework. It uses
only the framework's public API, because the production builds rename internal
names and leave public ones unchanged. Each extension is published to npm with
its own version number.

| Package | What it does | Docs |
|---|---|---|
| [`@wildflowerjs/threads`](packages/threads) | Runs a store on a Web Worker; the page binds to a mirror of it | [wildflowerjs.com/docs/threads](https://www.wildflowerjs.com/docs/threads/) |

## What each extension declares

An extension's `package.json` lists the framework versions, tiers and builds it
supports, and CI tests each of them.

```json
"peerDependencies": { "wildflowerjs": ">=1.5.3 <2" },
"wildflower": {
  "tiers":  ["nano", "mini", "mini-pool", "lite", "core", "spa", "full"],
  "builds": ["dev", "min"],
  "outputs": [ { "entry": "src/index.js", "file": "dist/x.min.js", "dev": false, "minify": true } ]
}
```

- `peerDependencies.wildflowerjs`: the framework versions it works with. CI
  tests the lowest and the latest published versions in the range.
- `tiers` and `builds`: the framework files it works with. CI runs the
  extension's suite once per tier and build, pairing the extension's dev build
  with the framework's dev build and min with min.
- `outputs`: the files `scripts/build-extension.cjs` builds from the source.

## Building and testing

```sh
npm ci
npm run test:setup                 # once: Chromium for the browser tests
npm run build                      # every extension, from source
npm install --no-save wildflowerjs@1.5.3
node scripts/test-extension.cjs threads --core-dir node_modules/wildflowerjs/dist
```

The build uses the same toolchain as the framework. Rollup and terser are
downloaded as tarballs and checked against pinned SHA-512 hashes
(`scripts/fetch-rollup.cjs`, `scripts/fetch-terser.cjs`), so building runs no
`npm install`. `.npmrc` sets `ignore-scripts=true`, so installing the test
dependencies runs none of their install scripts.

## Releases

A release starts from a git tag made of the package name and version, such as
`threads-v0.1.0`. CI builds the package from the tagged commit, tests it
against the lowest and latest framework versions it supports, and publishes it
to npm with a signed provenance statement that links the package to that
commit and workflow.

## License

MIT. See [LICENSE](LICENSE).
