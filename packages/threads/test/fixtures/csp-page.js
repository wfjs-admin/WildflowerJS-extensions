/*
 * Page script for csp.html. Under the page's CSP (script-src 'self';
 * worker-src 'self') it loads the built extension named by ?build=dev|min,
 * then the definition file, checks the isomorphic thread round-trips a call,
 * then tries the inline (Blob) route, which the policy must refuse, and
 * reports what the extension said about it. console.warn is captured so the
 * TH-103 wording can be asserted from the test.
 */
(function () {
  var params = new URL(location.href).searchParams;
  var build = params.get('build') || 'dev';
  // The framework tier the suite runs against (THREADS_CORE), so the page
  // loads the same core as every other test rather than a fixed path.
  var core = params.get('core') || '/www/js/dist/wildflower.nano.min.js';
  var file = build === 'min' ? '/packages/threads/dist/threads.wf.min.js' : '/packages/threads/dist/threads.wf.js';
  var report = {
    build: build,
    inlineRan: !!window.__inlineRan,
    warnings: [],
    violations: [],
    iso: null,
    inline: null,
    fatal: null
  };
  var origWarn = console.warn;
  console.warn = function () {
    report.warnings.push(Array.prototype.map.call(arguments, String).join(' '));
    origWarn.apply(console, arguments);
  };
  document.addEventListener('securitypolicyviolation', function (ev) {
    report.violations.push({ blockedURI: ev.blockedURI, directive: ev.effectiveDirective || ev.violatedDirective });
  });

  function finish() {
    setTimeout(function () { window.parent.postMessage({ probe: 'threads-csp', report: report }, '*'); }, 50);
  }
  function load(src, done) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = done;
    s.onerror = function () { report.fatal = 'could not load ' + src; finish(); };
    document.head.appendChild(s);
  }
  function until(pred, ms, done, fail) {
    var t0 = performance.now();
    (function poll() {
      if (pred()) return done();
      if (performance.now() - t0 > ms) return fail();
      setTimeout(poll, 5);
    })();
  }

  // The page's framework tag first (any classic tier), then the extension,
  // then the definition: the order a real page uses.
  load(core, function () {
  load(file, function () {
    load('/packages/threads/test/fixtures/stats-def.js', function () {
      var t0 = performance.now();
      var s = window.stats;
      report.iso = { created: !!s, isLoadingAtStart: s ? s.isLoading : null, firstPatchMs: null, count: null, hasWindow: null, error: null };
      until(function () { return s && s.isLoading === false; }, 5000, function () {
        report.iso.firstPatchMs = +(performance.now() - t0).toFixed(1);
        s.search('beta');
        s.settled().then(function () {
          report.iso.count = s.count;
          return s.hasWindow();
        }).then(function (hw) {
          report.iso.hasWindow = hw;
          wildflower.unregister('stats');
          tryInline();
        }, function (e) {
          report.iso.error = String(e && e.message || e);
          tryInline();
        });
      }, function () {
        report.iso.error = 'timed out waiting for the first patch';
        tryInline();
      });
    });
  });
  });

  function tryInline() {
    var rec = { threw: null, errorCode: null, errorMessage: null, isLoading: null, callRejected: null, callRejectionCode: null };
    report.inline = rec;
    var t;
    try {
      t = wildflower.thread('inline', {
        state: { n: 1 },
        computed: { double: function () { return this.n * 2; } },
        bump: function () { this.n++; }
      }, { inline: true });
    } catch (e) {
      rec.threw = String(e && e.message || e);
      return finish();
    }
    var call = t.bump();
    call.then(function () { rec.callRejected = false; }, function (e) { rec.callRejected = true; rec.callRejectionCode = e && e.code || null; });
    // `error` is the message, as on a query store. The TH-103 code reaches
    // the page on the rejected call (callRejectionCode below).
    until(function () { return t.error !== null; }, 5000, function () {
      rec.errorMessage = t.error;
      rec.isLoading = t.isLoading;
      setTimeout(finish, 20);
    }, function () {
      rec.errorMessage = 'no error surfaced within 5 s';
      rec.isLoading = t.isLoading;
      finish();
    });
  }
})();
