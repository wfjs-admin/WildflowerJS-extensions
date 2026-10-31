#!/usr/bin/env node
/**
 * test-extension.cjs — run an extension's suite across every framework tier
 * and build its manifest declares.
 *
 *   node scripts/test-extension.cjs <name>                    # core from www/js/dist
 *   node scripts/test-extension.cjs --all                     # every package with a manifest
 *   node scripts/test-extension.cjs <name> --core-dir node_modules/wildflowerjs/dist
 *   node scripts/test-extension.cjs <name> --tiers nano,full --builds min
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
 * it is over; not in the package.json, which npm always publishes. As
 * with the framework's size-budgets.json, a raise goes in the same change as
 * the code that needed it, with `since` and `why` filled in, and a file more
 * than 200 B under budget prints the new floor to accept.
 *
 * build-and-test.cjs runs `--all` as its last step, so a core change that
 * breaks an extension fails the matrix. Exits 1 if any leg fails, after
 * running all of them.
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
    console.error('Usage: node scripts/test-extension.cjs <name> | --all [--core-dir DIR] [--tiers a,b] [--builds dev,min]');
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
    for (const build of useBuilds) {
        for (const tier of useTiers) {
            const rel = path.join(coreDir, coreFile(tier, build));
            const label = `${tier}.${build}`;
            if (!fs.existsSync(path.join(ROOT, rel))) {
                results.push({ label, ok: false, note: `missing ${rel}` });
                console.log(`== ${label}: MISSING ${rel}`);
                continue;
            }
            console.log(`== ${label}: extension ${build}, core ${rel}`);
            const run = spawnSync('npx', ['vitest', 'run', '--config', config], {
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
                const fails = plain.split('\n').filter(l => /[×✗]|FAIL|AssertionError|Error:/.test(l)).slice(0, 12);
                for (const l of fails) console.log('     ' + l.trim());
            }
        }
    }

    // The package's Node tests, once: anything in test/ named *.test.cjs.
    const testDir = path.join(pkgDir, 'test');
    const nodeTests = fs.existsSync(testDir) ? fs.readdirSync(testDir).filter((f) => f.endsWith('.test.cjs')).sort() : [];
    if (nodeTests.length) {
        const files = nodeTests.map((f) => path.join('packages', pkgName, 'test', f));
        console.log(`== node: ${files.join(', ')}`);
        const run = spawnSync('node', ['--test', ...files], { cwd: ROOT, encoding: 'utf8' });
        const plain = stripAnsi((run.stdout || '') + (run.stderr || ''));
        const pass = (plain.match(/# pass (\d+)/) || [])[1];
        const fail = (plain.match(/# fail (\d+)/) || [])[1];
        const summary = pass !== undefined ? `${pass} passed${fail && fail !== '0' ? ', ' + fail + ' failed' : ''}` : '(no summary)';
        const ok = run.status === 0;
        results.push({ label: 'node', ok, note: summary });
        console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${summary}`);
        if (!ok) {
            const fails = plain.split('\n').filter(l => /^not ok|Error|expected/.test(l.trim())).slice(0, 12);
            for (const l of fails) console.log('     ' + l.trim());
        }
    }

    // The size leg: the production file's Brotli bytes against the package's
    // budget in extension-budgets.json. A package with no budget is
    // reported, not failed. The bytes are compressed here, with the quality
    // build-rollup.cjs uses for its .br files, because build-extension.cjs
    // (the extensions repo's build) writes no .br beside the file.
    const prod = (manifest.outputs || []).find((o) => o.minify);
    if (prod) {
        const min = path.join(pkgDir, prod.file);
        const budgets = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension-budgets.json'), 'utf8'));
        const budget = budgets[pkgName] && budgets[pkgName].br;
        const brSize = () => zlib.brotliCompressSync(fs.readFileSync(min), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
        if (!fs.existsSync(min)) {
            results.push({ label: 'size', ok: false, note: `missing ${path.relative(ROOT, min)}; build it first` });
            console.log(`== size: MISSING ${path.relative(ROOT, min)}`);
        } else if (!budget) {
            console.log(`== size: ${brSize()} B brotli, no budget in extension-budgets.json`);
        } else {
            const size = brSize();
            const ok = size <= budget;
            const note = `${size} B brotli, budget ${budget} B` + (ok ? '' : ` (${size - budget} B over: raise its budget in extension-budgets.json with since and why, in the same change)`);
            results.push({ label: 'size', ok, note });
            console.log(`== size: ${ok ? 'PASS' : 'FAIL'}  ${note}`);
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
