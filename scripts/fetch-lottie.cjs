#!/usr/bin/env node
/**
 * Fetch lottie-web for the Kinetic extension's browser tests, SHA-512
 * verified.
 *
 * No npm CLI invocation, no postinstall scripts: the registry tarball is
 * downloaded once, checked against the pinned integrity, and only the one
 * file the tests load is extracted:
 *
 *   tools/lottie/build/player/lottie.min.js   (the player with the svg,
 *                                              canvas and html renderers)
 *
 * Kinetic never bundles or imports lottie-web: a page that plays Lottie
 * loads it, as it loads three.js. This copy exists so the suite runs offline
 * against an exact version. To bump it, update VERSION and INTEGRITY (from
 * https://registry.npmjs.org/lottie-web/<version>, dist.integrity) and
 * re-run.
 *
 *   node scripts/fetch-lottie.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const os = require('os');
const { execFileSync } = require('child_process');

// Pinned 2026-10-10 from the npm registry.
const VERSION = '5.13.0';
const INTEGRITY = 'sha512-+gfBXl6sxXMPe8tKQm7qzLnUy5DUPJPKIyRHwtpCpyUEYjHYRJC/5gjUvdkuO2c3JllrPtHXH5UJJK8LRYl5yQ==';
const FILES = ['package/build/player/lottie.min.js'];

const OUT_DIR = path.join(__dirname, '..', 'tools', 'lottie');
const VER_FILE = path.join(OUT_DIR, '.wf-pinned-version');

const tarBin = process.platform === 'win32'
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';

function fetchUrl(url, redirectsLeft = 5) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
                return resolve(fetchUrl(res.headers.location, redirectsLeft - 1));
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

async function main() {
    if (fs.existsSync(VER_FILE) && fs.readFileSync(VER_FILE, 'utf8') === `${VERSION}\n${INTEGRITY}`) {
        console.log(`lottie-web@${VERSION} already fetched`);
        return;
    }
    const url = `https://registry.npmjs.org/lottie-web/-/lottie-web-${VERSION}.tgz`;
    console.log(`Fetching lottie-web@${VERSION}`);
    const buf = await fetchUrl(url);
    const actual = 'sha512-' + crypto.createHash('sha512').update(buf).digest('base64');
    if (actual !== INTEGRITY) {
        console.error(`SHA-512 mismatch for lottie-web@${VERSION}`);
        console.error(`Expected: ${INTEGRITY}`);
        console.error(`Got:      ${actual}`);
        process.exit(1);
    }
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const tmpFile = path.join(os.tmpdir(), `lottie-web-${VERSION}-${process.pid}.tgz`);
    fs.writeFileSync(tmpFile, buf);
    try {
        execFileSync(tarBin, ['-xzf', tmpFile, '-C', OUT_DIR, '--strip-components=1', ...FILES], { stdio: 'inherit' });
    } finally {
        try { fs.unlinkSync(tmpFile); } catch (e) { /* already gone */ }
    }
    fs.writeFileSync(VER_FILE, `${VERSION}\n${INTEGRITY}`);
    console.log(`lottie-web@${VERSION} -> tools/lottie/build/player/`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
