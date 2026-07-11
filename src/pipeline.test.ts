import { describe, expect, it, vi } from 'vitest';

import { createDedupeFilter } from './dedupe';
import { createClientErrorPipeline } from './pipeline';
import { createMemoryErrorReporter } from './reporter';

describe('client error pipeline', () => {
  it('uses exact TTL and bounded oldest-entry eviction', () => {
    let now = 1_000;
    const dedupe = createDedupeFilter({
      ttlMs: 100,
      maxEntries: 2,
      now: () => now,
    });
    expect(dedupe.accept({ fingerprint: 'a' })).toBe(true);
    expect(dedupe.accept({ fingerprint: 'a' })).toBe(false);
    now = 1_099;
    expect(dedupe.accept({ fingerprint: 'a' })).toBe(false);
    now = 1_100;
    expect(dedupe.accept({ fingerprint: 'a' })).toBe(true);
    expect(dedupe.accept({ fingerprint: 'b' })).toBe(true);
    expect(dedupe.accept({ fingerprint: 'c' })).toBe(true);
    expect(dedupe.size()).toBe(2);
    expect(dedupe.accept({ fingerprint: 'a' })).toBe(true);
    expect(dedupe.size()).toBe(2);
  });

  it('returns typed ignore, dedupe, rate, and reporter-failure outcomes', async () => {
    let now = 0;
    const reporter = { report: vi.fn() };
    const pipeline = createClientErrorPipeline({
      reporters: [reporter],
      ignore: (error) => error === 'ignore',
      rateLimit: { maxReports: 1, intervalMs: 100, now: () => now },
      normalize: { now: () => new Date('2026-07-10T00:00:00.000Z') },
    });

    expect((await pipeline.report('ignore')).status).toBe('ignored');
    const repeated = new Error('one');
    expect((await pipeline.report(repeated)).status).toBe('reported');
    expect((await pipeline.report(repeated)).status).toBe('deduped');
    expect((await pipeline.report(new Error('two'))).status).toBe(
      'rate-limited',
    );
    now = 100;
    expect((await pipeline.report(new Error('two'))).status).toBe('reported');
    expect(reporter.report).toHaveBeenCalledTimes(2);

    const failing = createClientErrorPipeline({
      reporters: [{ report: () => Promise.reject(new Error('sink down')) }],
      dedupe: false,
      rateLimit: false,
    });
    expect((await failing.report(new Error('failure'))).status).toBe(
      'reporter-failed',
    );
  });

  it('applies queue backpressure and flushes pending reporters', async () => {
    let release: (() => void) | undefined;
    const reporter = {
      report: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    };
    const pipeline = createClientErrorPipeline({
      reporters: [reporter],
      maxQueueSize: 1,
      dedupe: false,
      rateLimit: false,
    });
    const first = pipeline.report(new Error('first'));
    expect(pipeline.pending()).toBe(1);
    expect((await pipeline.report(new Error('second'))).status).toBe(
      'queue-full',
    );
    release?.();
    await pipeline.flush();
    expect((await first).status).toBe('reported');
    expect(pipeline.pending()).toBe(0);
  });

  it('keeps a bounded deeply frozen memory snapshot', () => {
    const reporter = createMemoryErrorReporter({ maxEntries: 1 });
    const pipeline = createClientErrorPipeline({
      reporters: [reporter],
      dedupe: false,
      rateLimit: false,
    });
    return Promise.all([
      pipeline.report(new Error('first')),
      pipeline.report(new Error('second')),
    ]).then(() => {
      expect(reporter.reports).toHaveLength(1);
      expect(reporter.reports[0]?.message).toBe('second');
      expect(Object.isFrozen(reporter.reports)).toBe(true);
      expect(Object.isFrozen(reporter.reports[0])).toBe(true);
    });
  });

  it('validates dedupe, rate, queue, and reporter configuration', () => {
    expect(() => createDedupeFilter({ ttlMs: 0 })).toThrow(TypeError);
    expect(() => createDedupeFilter({ maxEntries: 0 })).toThrow(TypeError);
    expect(() => createClientErrorPipeline({ maxQueueSize: 0 })).toThrow(
      TypeError,
    );
    expect(() =>
      createClientErrorPipeline({
        rateLimit: { maxReports: 0, intervalMs: 1 },
      }),
    ).toThrow(TypeError);
    expect(() => createClientErrorPipeline({ reporters: [] })).toThrow(
      TypeError,
    );
  });

  it('returns typed failures and does not poison dedupe when injected clocks fail', async () => {
    let fail = true;
    const error = new Error('retry clock failure');
    const pipeline = createClientErrorPipeline({
      reporters: [{ report: vi.fn() }],
      rateLimit: {
        maxReports: 1,
        intervalMs: 100,
        now: () => {
          if (fail) return Number.NaN;
          return 0;
        },
      },
    });
    await expect(pipeline.report(error)).resolves.toMatchObject({
      status: 'pipeline-failed',
    });
    fail = false;
    await expect(pipeline.report(error)).resolves.toMatchObject({
      status: 'reported',
    });

    const normalizationFailure = createClientErrorPipeline({
      normalize: {
        now: () => {
          throw new Error('clock CANARY');
        },
      },
    });
    await expect(normalizationFailure.report(new Error('x'))).resolves.toEqual({
      accepted: false,
      status: 'normalization-failed',
    });
  });

  it('forgets dedupe state after complete reporter failure', async () => {
    const report = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(undefined);
    const pipeline = createClientErrorPipeline({
      reporters: [{ report }],
      rateLimit: false,
    });
    const error = new Error('same');

    expect((await pipeline.report(error)).status).toBe('reporter-failed');
    expect((await pipeline.report(error)).status).toBe('reported');
    expect(report).toHaveBeenCalledTimes(2);
  });
});
