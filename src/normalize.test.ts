import { describe, expect, it } from 'vitest';

import {
  createDedupeFilter,
  createMemoryErrorReporter,
  normalizeBrowserErrorEvent,
  normalizeClientError,
  normalizeUnhandledRejection,
  sanitizeValue,
} from './index';

describe('client-error-handling', () => {
  it('normalizes thrown Error objects', () => {
    const error = new Error('Boom');
    const normalized = normalizeClientError(error, {}, {
      now: () => new Date('2026-07-02T00:00:00.000Z'),
    });

    expect(normalized).toMatchObject({
      name: 'Error',
      message: 'Boom',
      timestamp: '2026-07-02T00:00:00.000Z',
    });
    expect(normalized.fingerprint).toContain('Error|Boom');
  });

  it('normalizes non-Error thrown values', () => {
    const normalized = normalizeClientError({ reason: 'bad' });

    expect(normalized.name).toBe('NonErrorThrown');
    expect(normalized.message).toBe('{"reason":"bad"}');
  });

  it('redacts request and nested metadata secrets', () => {
    const normalized = normalizeClientError(new Error('Request failed'), {
      request: {
        method: 'POST',
        url: 'https://api.example.test/resource?token=abc&safe=ok',
        headers: {
          authorization: 'Bearer secret',
          cookie: 'session=secret',
          'x-request-id': 'safe-id',
        },
        body: {
          password: 'hidden',
          keep: 'visible',
        },
      },
      metadata: {
        nested: {
          accessToken: 'secret-token',
          rawBody: '{"private":true}',
          query: 'https://example.test/callback?code=abc',
        },
      },
    });

    expect(normalized.context).toEqual(expect.objectContaining({
      request: expect.objectContaining({
        url: 'https://api.example.test/resource?token=%5Bredacted%5D&safe=ok',
        headers: {
          authorization: '[redacted]',
          cookie: '[redacted]',
          'x-request-id': 'safe-id',
        },
        body: '[redacted]',
      }),
    }));
    expect(JSON.stringify(normalized.context)).not.toContain('secret-token');
    expect(JSON.stringify(normalized.context)).not.toContain('hidden');
    expect(JSON.stringify(normalized.context)).not.toContain('abc');
  });

  it('normalizes browser error events without browser globals', () => {
    const normalized = normalizeBrowserErrorEvent({
      message: 'Script failed',
      filename: 'app.js',
      lineno: 3,
      colno: 12,
    });

    expect(normalized.name).toBe('ErrorEvent');
    expect(normalized.context).toEqual(expect.objectContaining({
      metadata: expect.objectContaining({
        filename: 'app.js',
        lineno: 3,
        colno: 12,
      }),
    }));
  });

  it('marks unhandled rejections', () => {
    const normalized = normalizeUnhandledRejection(new Error('nope'));

    expect(normalized.context).toEqual(expect.objectContaining({
      metadata: expect.objectContaining({
        unhandledRejection: true,
      }),
    }));
  });

  it('dedupes repeated fingerprints and provides a memory reporter fake', () => {
    const filter = createDedupeFilter({ now: () => 1 });
    const reporter = createMemoryErrorReporter();
    const normalized = normalizeClientError(new Error('Same'));

    expect(filter.accept(normalized)).toBe(true);
    expect(filter.accept(normalized)).toBe(false);
    reporter.report(normalized);

    expect(reporter.reports).toHaveLength(1);
  });

  it('handles circular metadata and depth limits without leaking raw objects', () => {
    const circular: Record<string, unknown> = { safe: 'visible' };
    circular.self = circular;

    expect(sanitizeValue(circular)).toEqual({
      safe: 'visible',
      self: '[circular]',
    });
    expect(sanitizeValue({ one: { two: { three: true } } }, { maxDepth: 2 })).toEqual({
      one: {
        two: '[truncated]',
      },
    });
  });

  it('redacts sensitive query parameters in nested string values', () => {
    const sanitized = sanitizeValue({
      redirect: 'https://example.test/callback?token=secret&next=/safe',
      nested: {
        apiKey: 'secret-key',
      },
    });

    expect(JSON.stringify(sanitized)).not.toContain('secret-key');
    expect(JSON.stringify(sanitized)).not.toContain('token=secret');
    expect(JSON.stringify(sanitized)).toContain('next=%2Fsafe');
  });

  it('expires dedupe fingerprints after the configured ttl', () => {
    let now = 1_000;
    const filter = createDedupeFilter({
      now: () => now,
      ttlMs: 100,
    });
    const error = { fingerprint: 'Error|same' };

    expect(filter.accept(error)).toBe(true);
    expect(filter.accept(error)).toBe(false);

    now = 1_200;

    expect(filter.accept(error)).toBe(true);
  });
});
