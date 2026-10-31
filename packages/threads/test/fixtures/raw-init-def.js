/*
 * A definition file that fills a raw (underscore) field in init(), loaded by
 * the worker through importScripts (the file route). The field has to reach
 * the page in the first patch.
 */
var rawinitfile = wildflower.thread('rawinitfile', {
  state: { count: 0, _grid: null },
  init: function () {
    var g = new Float32Array(4);
    for (var i = 0; i < 4; i++) g[i] = i * 10;
    this._grid = g;
    this.count = 4;
  }
});
