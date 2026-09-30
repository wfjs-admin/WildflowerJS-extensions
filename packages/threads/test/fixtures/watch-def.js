/*
 * A definition file with a watch block, loaded by the worker through
 * importScripts (the file route). The watcher runs in the worker, and its
 * write reaches the page like any other.
 */
var watchfile = wildflower.thread('watchfile', {
  state: { page: 3, params: { region: '' } },
  watch: {
    'params.region': function () { this.page = 0; }
  }
});
