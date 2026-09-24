/*
 * A definition file in the classic-script form. Loaded by the page after the
 * framework and the extension, and by the worker through importScripts; the
 * same wildflower.thread() call runs on both sides. `var` so the page's tests
 * can reach the store as window.stats.
 */
var stats = wildflower.thread('stats', {
  state: {
    rows: [
      { id: 1, name: 'alpha', revenue: 10 },
      { id: 2, name: 'beta', revenue: 20 },
      { id: 3, name: 'gamma', revenue: 30 },
      { id: 4, name: 'delta', revenue: 40 },
      { id: 5, name: 'beta-two', revenue: 50 }
    ],
    params: { query: '' }
  },
  computed: {
    filtered: function () {
      var q = this.params.query;
      return this.rows.filter(function (r) { return r.name.indexOf(q) !== -1; });
    },
    count: function () { return this.filtered.length; },
    revenue: function () { return this.filtered.reduce(function (s, r) { return s + r.revenue; }, 0); }
  },
  search: function (q) { this.params.query = q; },
  hasWindow: function () { return typeof window !== 'undefined'; }
});
