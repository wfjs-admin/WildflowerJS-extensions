// A route the tests control, for a file that is missing and then put on the
// server at the same URL: /__kinetic/flaky/<key>/<fixture> answers 404 until
// /__kinetic/flaky/<key>/fix has been asked for, and then serves the fixture
// from test/fixtures. Neither answer is cached. /__kinetic/slow/<ms>/<fixture>
// serves the fixture after <ms> milliseconds, for a page whose load event
// comes late.
import fs from 'node:fs'
import path from 'node:path'

const TYPES = { '.webm': 'video/webm', '.mp4': 'video/mp4', '.png': 'image/png', '.gif': 'image/gif' }

export function flakyRoute(root) {
  const fixed = new Set()
  return {
    name: 'kinetic-flaky-route',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const slow = /^\/__kinetic\/slow\/(\d+)\/([\w.-]+)/.exec(req.url || '')
        if (slow) {
          const file = path.join(root, 'packages', 'kinetic', 'test', 'fixtures', slow[2])
          setTimeout(() => {
            const data = fs.readFileSync(file)
            res.setHeader('Cache-Control', 'no-store')
            res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream')
            res.setHeader('Content-Length', String(data.length))
            res.end(data)
          }, Number(slow[1]))
          return
        }
        const m = /^\/__kinetic\/flaky\/([\w-]+)\/([\w.-]+)/.exec(req.url || '')
        if (!m) return next()
        res.setHeader('Cache-Control', 'no-store')
        if (m[2] === 'fix') { fixed.add(m[1]); res.statusCode = 204; return res.end() }
        if (!fixed.has(m[1])) { res.statusCode = 404; return res.end() }
        const file = path.join(root, 'packages', 'kinetic', 'test', 'fixtures', m[2])
        const data = fs.readFileSync(file)
        res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream')
        res.setHeader('Content-Length', String(data.length))
        res.end(data)
      })
    },
  }
}
