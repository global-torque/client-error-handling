import { describe, expect, it } from 'vitest';

import {
  createDedupeFilter,
  createMemoryErrorReporter,
  normalizeBrowserErrorEvent,
  normalizeClientError,
  normalizeUnhandledRejection,
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
});
