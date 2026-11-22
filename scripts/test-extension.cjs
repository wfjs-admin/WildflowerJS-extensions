#!/usr/bin/env node
/**
 * test-extension.cjs — run an extension's suite across every framework tier
 * and build its manifest declares.
 *
 *   node scripts/test-extension.cjs <name>                    # core from www/js/dist
 *   node scripts/test-extension.cjs --all                     # every package with a manifest
 *   node scripts/test-extension.cjs <name> --core-dir node_modules/wildflowerjs/dist
 *   node scripts/test-extension.cjs <name> --tiers nano,full --builds min
 *   node scripts/test-extension.cjs <name> --legs tiers,node --files runtime.test.js,check.test.cjs
 *
 * The manifest (package.json `wildflower` block) lists `tiers` and `builds`.
 * Each leg runs the package's vitest config with:
 *
 *   EXT_BUILD  the extension's own build (dev or min), paired with
 *   WF_CORE    the framework file of the same build, for that tier
 *
 * Pairing the builds (dev with dev, min with min) matches how a page is put
 * together; crossing them doubles the legs for no case a user would ship.
 * The core tier is `wildflower.<build>.js`; every other tier is
 * `wildflower.<tier>.<build>.js`, the names the npm package publishes.
 *
 * A package's Node tests, `test/*.test.cjs`, run once after its legs through
 * `node --test` (the Kinetic skill's check script is tested that way).
 *
 * The size leg compares the package's compressed production file (the
 * manifest output with `minify: true`, plus `.br`) against its entry in
 * extension-budgets.json at the root, `{ br, since, why }`, and fails when
 * it is over; not in the package.json, which npm always publishes. A raise
 * goes in the same change as the code that needed it, with `since` and `why`
 * filled in, and a file more than 200 B under budget prints the new floor to
 * accept. A checkout with no extension-budgets.json has no size leg.
 *
 * Exits 1 if any leg fails, after running all of them.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const name = args.find(a => !a.startsWith('--'));
const all = args.includes('--all');
const opt = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

if (!name && !all) {
    console.error('Usage: node scripts/test-extension.cjs <name> | --all [--core-dir DIR] [--tiers a,b] [--builds dev,min] [--legs tiers,node,render,size] [--files a.test.js,b.test.cjs]');
    process.exit(1);
}

// Every package whose manifest declares tiers: the extensions the matrix owes
// a run to, in a fixed order so the output reads the same each time.
function discover() {
    const dir = path.join(ROOT, 'packages');
    return fs.readdirSync(dir).filter((d) => {
        const file = path.join(dir, d, 'package.json');
        if (!fs.existsSync(file)) return false;
        const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
        return !!(pkg.wildflower && Array.isArray(pkg.wildflower.tiers) && pkg.wildflower.tiers.length);
    }).sort();
}

const coreDir = opt('--core-dir') || path.join('www', 'js', 'dist');
const coreFile = (tier, build) => (tier === 'core' ? `wildflower.${build}.js` : `wildflower.${tier}.${build}.js`);
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, ''); // eslint-disable-line no-control-regex

// What a failed vitest leg says about each failure: the test's FAIL line in
// the report's failed-tests section and the lines under it (the error, the
// expected and received values, the place in the file), so a failure that
// only another machine shows can be read from its log.
function failureDetail(plain, cap = 160) {
    const lines = plain.split('\n');
    const out = [];
    for (let i = 0; i < lines.length && out.length < cap; i++) {
        if (!/^\s*FAIL\s/.test(lines[i])) continue;
        for (let j = i; j < Math.min(lines.length, i + 28) && out.length < cap; j++) {
            if (j > i && /^\s*FAIL\s|^⎯+/.test(lines[j])) break;
            if (lines[j].trim()) out.push(lines[j].replace(/\s+$/, ''));
        }
    }
    return out;
}

function testPackage(pkgName) {
    const pkgDir = path.join(ROOT, 'packages', pkgName);
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    const manifest = pkg.wildflower || {};
    const tiers = (opt('--tiers') || '').split(',').filter(Boolean);
    const builds = (opt('--builds') || '').split(',').filter(Boolean);
    const useTiers = tiers.length ? tiers : (manifest.tiers || []);
    const useBuilds = builds.length ? builds : (manifest.builds || []);
    if (!useTiers.length || !useBuilds.length) {
        console.error(`packages/${pkgName}: the manifest declares no tiers or builds`);
        return { results: [{ label: 'manifest', ok: false, note: 'no tiers or builds' }] };
    }
    const config = path.join('packages', pkgName, 'vitest.config.js');
    const results = [];
    // --legs picks the legs that run (tiers, node, render, size; all of them
    // by default), and --files names the test files they run, by path or by
    // name in the package's test folder: .test.js files go to the tier legs
    // and the render leg, .test.cjs files to the Node leg, and a leg with no
    // file of its kind named does not run. For a run that looks at a few
    // tests only.
    const legs = (opt('--legs') || 'tiers,node,render,size').split(',').filter(Boolean);
    const named = (opt('--files') || '').split(',').filter(Boolean).map((f) => (f.includes('/') ? f : path.join('packages', pkgName, 'test', f)));
    const browserFiles = named.filter((f) => f.endsWith('.test.js'));
    const nodeFiles = named.filter((f) => f.endsWith('.test.cjs'));
    const runs = (leg, files) => legs.includes(leg) && (!named.length || files.length > 0);
    for (const build of (runs('tiers', browserFiles) ? useBuilds : [])) {
        for (const tier of useTiers) {
            const rel = path.join(coreDir, coreFile(tier, build));
            const label = `${tier}.${build}`;
            if (!fs.existsSync(path.join(ROOT, rel))) {
                results.push({ label, ok: false, note: `missing ${rel}` });
                console.log(`== ${label}: MISSING ${rel}`);
                continue;
            }
            console.log(`== ${label}: extension ${build}, core ${rel}`);
            const run = spawnSync('npx', ['vitest', 'run', '--config', config, ...browserFiles], {
                cwd: ROOT,
                env: { ...process.env, EXT_BUILD: build, WF_CORE: '/' + rel.split(path.sep).join('/') },
                encoding: 'utf8',
            });
            const plain = stripAnsi((run.stdout || '') + (run.stderr || ''));
            const summary = (plain.match(/Tests\s+[^\n]+/) || ['(no summary)'])[0].trim();
            const ok = run.status === 0;
            results.push({ label, ok, note: summary });
            console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${summary}`);
            if (!ok) {
                const fails = plain.split('\n').filter(l => /[×✗]/.test(l)).slice(0, 20);
                for (const l of fails) console.log('     ' + l.trim());
                for (const l of failureDetail(plain)) console.log('     ' + l);
            }
        }
    }

    // The package's Node tests, once: anything in test/ named *.test.cjs.
    const testDir = path.join(pkgDir, 'test');
    const nodeTests = (runs('node', nodeFiles) && fs.existsSync(testDir) ? fs.readdirSync(testDir).filter((f) => f.endsWith('.test.cjs')).sort() : [])
        .filter((f) => !nodeFiles.length || nodeFiles.includes(path.join('packages', pkgName, 'test', f)));
    if (nodeTests.length) {
        const files = nodeTests.map((f) => path.join('packages', pkgName, 'test', f));
        console.log(`== node: ${files.join(', ')}`);
        const run = spawnSync('node', ['--test', ...files], { cwd: ROOT, encoding: 'utf8' });
        const plain = stripAnsi((run.stdout || '') + (run.stderr || ''));
        // The summary in either of node --test's reporters: TAP's "# pass 58"
        // or the spec reporter's "ℹ pass 58".
        const pass = (plain.match(/(?:#|ℹ) pass (\d+)/) || [])[1];
        const fail = (plain.match(/(?:#|ℹ) fail (\d+)/) || [])[1];
        const summary = pass !== undefined ? `${pass} passed${fail && fail !== '0' ? ', ' + fail + ' failed' : ''}` : '(no summary)';
        const ok = run.status === 0;
        results.push({ label: 'node', ok, note: summary });
        console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${summary}`);
        if (!ok) {
            // A failed test's line in either reporter ("not ok", or "✖"), and
            // what it says. A passing test whose title holds "Error" is not one.
            const fails = plain.split('\n').filter(l => /^not ok|^✖|^\s*(Error|AssertionError)|expected|actual/.test(l.trim()) && !/^✔/.test(l.trim())).slice(0, 20);
            for (const l of fails) console.log('     ' + l.trim());
            // The spec reporter's closing section, each failed test with its error in full.
            const all = plain.split('\n');
            const at = all.findIndex(l => /failing tests:/.test(l));
            if (at >= 0) for (const l of all.slice(at, at + 120)) if (l.trim()) console.log('     ' + l.replace(/\s+$/, ''));
            if (run.status === null) console.log('     the run was stopped: ' + (run.error ? run.error.message : 'signal ' + run.signal));
        }
    }

    // The package's render suite, once: vitest.render.config.js, which runs
    // in an installed Chrome (the headless shell has no WebCodecs), against
    // the full tier's development build from the same core directory as the
    // legs above. On a machine with no installed Chrome the leg says it was
    // skipped; it does not fail.
    const renderConfig = path.join('packages', pkgName, 'vitest.render.config.js');
    if (runs('render', browserFiles) && fs.existsSync(path.join(ROOT, renderConfig))) {
        const renderCore = path.join(coreDir, coreFile('full', 'dev'));
        console.log(`== render: ${renderConfig}, core ${renderCore}`);
        const run = spawnSync('npx', ['vitest', 'run', '--config', renderConfig, ...browserFiles], {
            cwd: ROOT,
            env: { ...process.env, EXT_BUILD: 'dev', WF_CORE: '/' + renderCore.split(path.sep).join('/') },
            encoding: 'utf8',
        });
        const plain = stripAnsi((run.stdout || '') + (run.stderr || ''));
        const noChrome = /distribution 'chrome' is not found|Executable doesn't exist/i.test(plain);
        const summary = noChrome ? 'skipped: no installed Chrome' : (plain.match(/Tests\s+[^\n]+/) || ['(no summary)'])[0].trim();
        const ok = noChrome || run.status === 0;
        results.push({ label: 'render', ok, note: summary });
        console.log(`   ${ok ? (noChrome ? 'SKIP' : 'PASS') : 'FAIL'}  ${summary}`);
        if (!ok) {
            const fails = plain.split('\n').filter(l => /[×✗]/.test(l)).slice(0, 20);
            for (const l of fails) console.log('     ' + l.trim());
            for (const l of failureDetail(plain)) console.log('     ' + l);
        }
    }

    // The size leg: the production file's Brotli bytes against the package's
    // budget in extension-budgets.json. A package with no budget is
    // reported, not failed. The bytes are compressed here, at Brotli quality
    // 11, because build-extension.cjs writes no .br beside the file.
    // Every production file the manifest lists, each against its own budget:
    // the package's name, or the output's `budget` key for a second file.
    // Without the budgets file there is nothing to compare against, and the
    // leg is left out.
    const budgetsFile = path.join(ROOT, 'extension-budgets.json');
    const sized = legs.includes('size') && !named.length;
    if (sized && !fs.existsSync(budgetsFile)) console.log('== size: no extension-budgets.json here, so sizes are not checked');
    const budgets = sized && fs.existsSync(budgetsFile) ? JSON.parse(fs.readFileSync(budgetsFile, 'utf8')) : null;
    for (const prod of (budgets ? manifest.outputs || [] : []).filter((o) => o.minify)) {
        const min = path.join(pkgDir, prod.file);
        const key = prod.budget || pkgName;
        const budget = budgets[key] && budgets[key].br;
        const brSize = () => zlib.brotliCompressSync(fs.readFileSync(min), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
        const label = prod.budget ? 'size ' + key : 'size';
        if (!fs.existsSync(min)) {
            results.push({ label, ok: false, note: `missing ${path.relative(ROOT, min)}; build it first` });
            console.log(`== ${label}: MISSING ${path.relative(ROOT, min)}`);
        } else if (!budget) {
            console.log(`== ${label}: ${brSize()} B brotli, no budget in extension-budgets.json`);
        } else {
            const size = brSize();
            const ok = size <= budget;
            const note = `${size} B brotli, budget ${budget} B` + (ok ? '' : ` (${size - budget} B over: raise its budget in extension-budgets.json with since and why, in the same change)`);
            results.push({ label, ok, note });
            console.log(`== ${label}: ${ok ? 'PASS' : 'FAIL'}  ${note}`);
            if (ok && budget - size > 200) console.log(`   ${budget - size} B under budget; the new floor is ${size}`);
        }
    }

    const failed = results.filter(r => !r.ok);
    console.log(`\n${pkgName}: ${results.length - failed.length}/${results.length} legs passed`);
    for (const r of failed) console.log(`  FAIL ${r.label}: ${r.note}`);
    return { results, failed };
}

const names = all ? discover() : [name];
if (!names.length) {
    console.error('no package under packages/ declares tiers in its manifest');
    process.exit(1);
}
let anyFailed = false;
for (const n of names) {
    if (names.length > 1) console.log(`\n#### ${n}`);
    const { failed } = testPackage(n);
    if (failed && failed.length) anyFailed = true;
}
if (names.length > 1) console.log(`\nextensions: ${names.join(', ')}: ${anyFailed ? 'FAILED' : 'all legs passed'}`);
process.exit(anyFailed ? 1 : 0);
