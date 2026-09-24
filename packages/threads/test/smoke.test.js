/**
 * First contact: the built file loads, spawns itself through the inline
 * route, the first patch clears isLoading, a write reaches the worker and
 * the computeds come back.
 */
import { describe, it, expect } from 'vitest';
import { threadInline, endThread, statsDefinition, until, BUILD } from './helpers.js';

describe(`smoke (${BUILD})`, () => {
  it('creates a thread, receives the first patch, round-trips a write', async () => {
    const stats = await threadInline('stats', statsDefinition());
    try {
      expect(stats.isLoading).toBe(true);
      expect(stats.count).toBeUndefined();
      expect(stats.params.query).toBe('');
      await until(() => stats.isLoading === false, 5000, 'first patch');
      expect(stats.count).toBe(5);
      expect(stats.revenue).toBe(150);
      expect(stats.top).toBe('beta-two');
      expect(stats.filtered.length).toBe(5);

      stats.params.query = 'beta';
      expect(stats.params.query).toBe('beta');
      expect(stats.pending).toBe(1);
      await stats.settled();
      expect(stats.pending).toBe(0);
      expect(stats.count).toBe(2);
      expect(stats.revenue).toBe(70);
      expect(stats.filtered.map((r) => r.name)).toEqual(['beta', 'beta-two']);
      expect(stats.top).toBe('beta-two');
      expect(stats.error).toBeNull();
    } finally {
      endThread(stats);
    }
  });
});
