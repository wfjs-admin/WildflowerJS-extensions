#!/usr/bin/env node
/**
 * extension-core-versions.cjs — which published framework versions an
 * extension's CI tests against.
 *
 *   node scripts/extension-core-versions.cjs <name>
 *
 * Reads the package's peerDependencies.wildflowerjs range and prints, as JSON,
 * the LOWEST and the LATEST stable published versions that satisfy it
 * (deduplicated, so a range with one match prints one version). Testing both
 * ends proves the floor still holds and catches a newer core breaking the
 * extension before a user does.
 *
 * Supports space-separated comparators (>=, >, <=, <, =, bare version), which
 * is what extension manifests use; anything else is refused rather than
 * guessed at.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const name = process.argv[2];
if (!name) {
    console.error('Usage: node scripts/extension-core-versions.cjs <name>');
    process.exit(1);
}
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', name, 'package.json'), 'utf8'));
const range = pkg.peerDependencies && pkg.peerDependencies.wildflowerjs;
if (!range) {
    console.error(`packages/${name} declares no peerDependencies.wildflowerjs range`);
    process.exit(1);
}

const parse = (v) => v.split('.').map(Number);
const cmp = (a, b) => {
    const x = parse(a), y = parse(b);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
    return 0;
};
const comparators = range.trim().split(/\s+/).map((c) => {
    const m = c.match(/^(>=|<=|>|<|=)?(\d+(?:\.\d+){0,2})$/);
    if (!m) {
        console.error(`Unsupported range comparator "${c}" in "${range}"`);
        process.exit(1);
    }
    return { op: m[1] || '=', v: m[2] };
});
const satisfies = (v) => comparators.every(({ op, v: w }) => {
    const d = cmp(v, w);
    return op === '>=' ? d >= 0 : op === '>' ? d > 0 : op === '<=' ? d <= 0 : op === '<' ? d < 0 : d === 0;
});

const all = JSON.parse(execFileSync('npm', ['view', 'wildflowerjs', 'versions', '--json'], { encoding: 'utf8' }));
const stable = (Array.isArray(all) ? all : [all]).filter(v => /^\d+\.\d+\.\d+$/.test(v) && satisfies(v)).sort(cmp);
if (!stable.length) {
    console.error(`No published wildflowerjs version satisfies "${range}"`);
    process.exit(1);
}
const picks = [...new Set([stable[0], stable[stable.length - 1]])];
console.log(JSON.stringify(picks));
