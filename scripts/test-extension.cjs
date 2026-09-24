#!/usr/bin/env node
/**
 * test-extension.cjs — run an extension's suite across every framework tier
 * and build its manifest declares.
 *
 *   node scripts/test-extension.cjs <name>                    # core from www/js/dist
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
 * Exits 1 if any leg fails, after running all of them.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const name = args.find(a => !a.startsWith('--'));
const opt = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

if (!name) {
    console.error('Usage: node scripts/test-extension.cjs <name> [--core-dir DIR] [--tiers a,b] [--builds dev,min]');
    process.exit(1);
}
const pkgDir = path.join(ROOT, 'packages', name);
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
const manifest = pkg.wildflower || {};
const tiers = (opt('--tiers') || '').split(',').filter(Boolean);
const builds = (opt('--builds') || '').split(',').filter(Boolean);
const useTiers = tiers.length ? tiers : (manifest.tiers || []);
const useBuilds = builds.length ? builds : (manifest.builds || []);
if (!useTiers.length || !useBuilds.length) {
    console.error(`packages/${name}: the manifest declares no tiers or builds`);
    process.exit(1);
}
const coreDir = opt('--core-dir') || path.join('www', 'js', 'dist');
const config = path.join('packages', name, 'vitest.config.js');

const coreFile = (tier, build) => (tier === 'core' ? `wildflower.${build}.js` : `wildflower.${tier}.${build}.js`);

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
        const out = (run.stdout || '') + (run.stderr || '');
        // eslint-disable-next-line no-control-regex
        const plain = out.replace(/\x1b\[[0-9;]*m/g, '');
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

const failed = results.filter(r => !r.ok);
console.log(`\n${name}: ${results.length - failed.length}/${results.length} legs passed`);
for (const r of failed) console.log(`  FAIL ${r.label}: ${r.note}`);
process.exit(failed.length ? 1 : 0);
