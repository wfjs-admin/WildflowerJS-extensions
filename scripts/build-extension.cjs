#!/usr/bin/env node
/**
 * build-extension.cjs — build one extension package from its manifest.
 *
 *   node scripts/build-extension.cjs <name>        # packages/<name>
 *   node scripts/build-extension.cjs --all         # every package with a manifest
 *
 * An extension is a directory under packages/ whose package.json carries a
 * `wildflower` block. Its `outputs` list says what to build:
 *
 *   { "entry": "src/index.js", "file": "dist/x.min.js", "dev": false, "minify": true }
 *
 * Each output is one rollup bundle (IIFE, the package banner on top) with
 * __DEV__ substituted, minified by terser when `minify` is set. Property
 * mangling is never applied: an extension touches the framework through its
 * public API only, so it has no internal names to mangle, and it must not
 * depend on the core's per-build mangled names.
 *
 * Same vendored, SHA-512-pinned rollup and terser as the framework build
 * (scripts/fetch-rollup.cjs, scripts/fetch-terser.cjs), and the same terser
 * compress and mangle settings as build-rollup.cjs uses for non-mangled
 * bundles. This file is synced to the extensions repo, whose CI builds
 * published artifacts with it from source.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PACKAGES = path.join(ROOT, 'packages');
const ROLLUP_DIR = path.join(ROOT, 'tools', 'rollup');
const TERSER_DIR = path.join(ROOT, 'tools', 'terser', 'node_modules', 'terser');

for (const [dir, fetcher] of [[ROLLUP_DIR, 'fetch-rollup.cjs'], [TERSER_DIR, 'fetch-terser.cjs']]) {
    if (!fs.existsSync(path.join(dir, 'package.json'))) {
        console.error(`Missing ${path.relative(ROOT, dir)}. Run: node scripts/${fetcher}`);
        process.exit(1);
    }
}
const rollup = require(ROLLUP_DIR);
const terser = require(TERSER_DIR);

// Mirrors terserBaseCompress / terserBaseMangle in build-rollup.cjs.
const TERSER = {
    compress: {
        drop_console: false, passes: 3, dead_code: true, drop_debugger: true,
        conditionals: true, evaluate: true, booleans: true, loops: true,
        unused: true, hoist_funs: true, hoist_vars: false, if_return: true,
        join_vars: true, sequences: true, properties: true, comparisons: true,
        inline: true, reduce_vars: true, collapse_vars: true,
    },
    mangle: { reserved: ['WildflowerJS', 'wildflower', 'RouteManager', 'SSRManager'], properties: false },
    format: { comments: /^!/ },
};

function readManifest(name) {
    const dir = path.join(PACKAGES, name);
    const file = path.join(dir, 'package.json');
    if (!fs.existsSync(file)) return null;
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!pkg.wildflower || !Array.isArray(pkg.wildflower.outputs)) return null;
    return { dir, pkg };
}

function devDefine(dev) {
    return {
        name: 'wf-dev-define',
        transform(code) {
            const out = code.replace(/\b__DEV__\b/g, String(!!dev));
            return out === code ? null : { code: out, map: null };
        },
    };
}

async function buildOutput(dir, pkg, out) {
    const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * ${pkg.description}
 *
 * Copyright (c) ${new Date().getFullYear()} WildflowerJS Contributors
 * Released under the MIT License
 */`;
    const bundle = await rollup.rollup({
        input: path.join(dir, out.entry),
        plugins: [devDefine(out.dev)],
        onwarn(warning, warn) {
            if (warning.code === 'CIRCULAR_DEPENDENCY') return;
            warn(warning);
        },
    });
    const { output } = await bundle.generate({ format: 'iife', name: 'WildflowerExtension', banner });
    await bundle.close();
    let code = output[0].code;
    if (out.minify) {
        const result = await terser.minify(code, {
            compress: { ...TERSER.compress },
            mangle: { ...TERSER.mangle },
            format: { ...TERSER.format },
        });
        if (result.error) throw result.error;
        code = result.code;
    }
    const dest = path.join(dir, out.file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, code);
    return code.length;
}

async function buildPackage(name) {
    const m = readManifest(name);
    if (!m) {
        console.error(`packages/${name} has no package.json with a wildflower.outputs list`);
        return false;
    }
    let ok = true;
    for (const out of m.pkg.wildflower.outputs) {
        process.stdout.write(`${name}/${out.file}`.padEnd(40) + ' ... ');
        try {
            const bytes = await buildOutput(m.dir, m.pkg, out);
            process.stdout.write(`${(bytes / 1024).toFixed(1)} KB\n`);
        } catch (e) {
            process.stdout.write('FAILED\n');
            console.error(e.stack || e.message);
            ok = false;
        }
    }
    return ok;
}

(async () => {
    const arg = process.argv[2];
    if (!arg) {
        console.error('Usage: node scripts/build-extension.cjs <name> | --all');
        process.exit(1);
    }
    const names = arg === '--all'
        ? fs.readdirSync(PACKAGES, { withFileTypes: true }).filter(e => e.isDirectory() && readManifest(e.name)).map(e => e.name)
        : [arg];
    let ok = true;
    for (const name of names) ok = (await buildPackage(name)) && ok;
    process.exit(ok ? 0 : 1);
})();
