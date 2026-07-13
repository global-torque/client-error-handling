import { describe, expect, it } from 'vitest';

import {
  normalizeBrowserErrorEvent,
  normalizeClientError,
  normalizeUnhandledRejection,
} from './normalize';

describe('normalizeClientError', () => {
  it('sanitizes every diagnostic field before creating an opaque fingerprint', () => {
    const error = new Error('token=CANARY_SECRET failed');
    error.name = 'Api/Error';
    Object.defineProperty(error, 'stack', {
      configurable: true,
      value: [
        'Api/Error: token=CANARY_SECRET failed',
        '    at https://user:password@example.test/app.js?token=CANARY_SECRET#private:1:2',
      ].join('\n'),
    });
    const normalized = normalizeClientError(
      error,
      {},
      {
        now: () => new Date('2026-07-10T00:00:00.000Z'),
        sanitize: { redactValues: ['CANARY_SECRET'] },
      },
    );
    const serialized = JSON.stringify(normalized);

    expect(normalized).toMatchObject({
      name: 'ApiError',
      timestamp: '2026-07-10T00:00:00.000Z',
    });
    expect(normalized.message).toContain('[redacted]');
    expect(normalized.stack).toBe('at https://example.test/app.js');
    expect(normalized.fingerprint).toMatch(/^ceh_[a-f0-9]{16}$/);
    expect(serialized).not.toContain('CANARY_SECRET');
    expect(serialized).not.toContain('password');
    expect(normalized.fingerprint).not.toContain(normalized.message);
    expect(Object.isFrozen(normalized)).toBe(true);
  });

  it('bounds and freezes causes and aggregate members', () => {
    const cause = new Error('password=hunter2');
    const aggregate = new AggregateError(
      [new Error('first'), 'token=second', new Error('third')],
      'aggregate',
      { cause },
    );
    const normalized = normalizeClientError(
      aggregate,
      {},
      {
        maxAggregateErrors: 2,
      },
    );

    expect(normalized.cause?.message).toBe('password=[redacted]');
    expect(normalized.errors).toHaveLength(2);
    expect(normalized.errors?.[1]?.name).toBe('NonErrorThrown');
    expect(Object.isFrozen(normalized.cause)).toBe(true);
    expect(Object.isFrozen(normalized.errors)).toBe(true);
  });

  it('enforces the total normalized-record byte budget and omits shared graphs', () => {
    const shared = new Error('shared '.repeat(40));
    const aggregate = new AggregateError(
      Array.from({ length: 10 }, () => shared),
      'aggregate '.repeat(40),
    );
    const normalized = normalizeClientError(
      aggregate,
      {},
      {
        sanitize: { maxTotalBytes: 512, maxStringLength: 200 },
        maxAggregateErrors: 10,
      },
    );
    const bytes = new TextEncoder().encode(
      JSON.stringify(normalized),
    ).byteLength;

    expect(bytes).toBeLessThanOrEqual(512);
    expect(normalized.fingerprint).toMatch(/^ceh_[a-f0-9]{16}$/);
    expect(Object.isFrozen(normalized)).toBe(true);

    const sharedRecord = normalizeClientError(
      aggregate,
      {},
      {
        sanitize: { maxTotalBytes: 4_096, maxStringLength: 100 },
        maxAggregateErrors: 10,
      },
    );
    expect(
      sharedRecord.errors?.filter(({ name }) => name === 'SharedError'),
    ).toHaveLength(9);
  });

  it('uses a non-diagnostic message for arbitrary thrown objects', () => {
    const normalized = normalizeClientError({ secret: 'CANARY' });
    expect(normalized.name).toBe('NonErrorThrown');
    expect(normalized.message).toBe('Non-error object value thrown');
    expect(JSON.stringify(normalized)).not.toContain('CANARY');
  });

  it('handles circular causes and hostile getters without executing them', () => {
    let reads = 0;
    const error: Record<string, unknown> = { name: 'Hostile', message: 'safe' };
    error.cause = error;
    Object.defineProperty(error, 'stack', {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error('must not execute');
      },
    });
    const normalized = normalizeClientError(error);

    expect(reads).toBe(0);
    expect(normalized.stack).toBeUndefined();
    expect(normalized.cause).toEqual({
      name: 'CircularError',
      message: 'Circular error reference omitted',
    });
  });

  it('normalizes browser and rejection events through the same allowlist', () => {
    const browser = normalizeBrowserErrorEvent(
      {
        message: 'Script failed',
        filename: '/app.js?token=secret#private',
        lineno: 3,
        colno: 12,
      },
      { metadata: { source: 'window', retryable: false } },
    );
    const rejection = normalizeUnhandledRejection(new Error('nope'));

    expect(browser.name).toBe('ErrorEvent');
    expect(browser.context).toMatchObject({
      metadata: {
        source: 'window',
        retryable: false,
        filename: '/app.js',
        lineno: 3,
        colno: 12,
      },
    });
    expect(rejection.context).toMatchObject({
      metadata: { unhandledRejection: true },
    });
  });

  it('bounds hostile aggregate arrays without calling accessors or proxy traps', () => {
    let reads = 0;
    const errors = new Array<unknown>(2);
    Object.defineProperty(errors, '0', {
      configurable: true,
      enumerable: true,
      value: new Error('safe'),
    });
    Object.defineProperty(errors, '1', {
      configurable: true,
      enumerable: true,
      get: () => {
        reads += 1;
        return new Error('must not execute');
      },
    });
    const normalized = normalizeClientError({
      name: 'AggregateError',
      message: 'bounded',
      errors,
    });
    expect(normalized.errors?.map(({ message }) => message)).toEqual([
      'safe',
      'Non-error undefined value thrown',
    ]);
    expect(reads).toBe(0);

    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();
    expect(
      normalizeClientError({
        name: 'AggregateError',
        message: 'x',
        errors: proxy,
      }).errors,
    ).toBeUndefined();
  });

  it('rejects invalid clocks and bounds recursive causes', () => {
    expect(() =>
      normalizeClientError(new Error('x'), {}, { now: () => new Date('bad') }),
    ).toThrow(/valid Date/);
    expect(() =>
      normalizeClientError(new Error('x'), {}, { maxCauseDepth: 0 }),
    ).toThrow(/positive/);
    expect(() =>
      normalizeClientError(
        new Error('x'),
        {},
        {
          sanitize: { maxTotalBytes: 128 },
        },
      ),
    ).toThrow(/at least 256/);
  });

  it('reads only verified ErrorEvent WebIDL getters', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'ErrorEvent');
    class TestErrorEvent {
      readonly #values: Record<string, unknown>;

      constructor(values: Record<string, unknown>) {
        this.#values = values;
      }

      get error(): unknown {
        return this.#values.error;
      }

      get message(): string {
        const value = this.#values.message;
        return typeof value === 'string' ? value : '';
      }

      get filename(): string {
        const value = this.#values.filename;
        return typeof value === 'string' ? value : '';
      }

      get lineno(): number {
        return Number(this.#values.lineno);
      }

      get colno(): number {
        return Number(this.#values.colno);
      }
    }
    Object.defineProperty(globalThis, 'ErrorEvent', {
      configurable: true,
      value: TestErrorEvent,
    });
    try {
      const normalized = normalizeBrowserErrorEvent(
        new TestErrorEvent({
          message: 'real token=CANARY',
          filename:
            'https://user:pass@example.test/app.js?token=CANARY#private',
          lineno: 3,
          colno: 4,
          error: new Error('nested token=CANARY'),
        }),
        {},
        { sanitize: { redactValues: ['CANARY'] } },
      );
      expect(normalized.message).toBe('nested token=[redacted]');
      expect(normalized.context).toMatchObject({
        metadata: {
          filename: 'https://example.test/app.js',
          lineno: 3,
          colno: 4,
        },
      });
      expect(JSON.stringify(normalized)).not.toContain('CANARY');

      let hostileReads = 0;
      class EvilErrorEvent extends TestErrorEvent {
        override get error(): unknown {
          hostileReads += 1;
          return new Error('hostile getter');
        }

        override get message(): string {
          hostileReads += 1;
          return 'hostile getter';
        }

        override get filename(): string {
          hostileReads += 1;
          return 'https://evil.test/?secret=x';
        }

        override get lineno(): number {
          hostileReads += 1;
          return 99;
        }

        override get colno(): number {
          hostileReads += 1;
          return 99;
        }
      }
      const subclassed = normalizeBrowserErrorEvent(
        new EvilErrorEvent({
          message: 'safe event',
          filename: '/safe.js',
          lineno: 1,
          colno: 2,
          error: new Error('safe nested'),
        }),
      );
      expect(hostileReads).toBe(0);
      expect(subclassed.message).toBe('safe nested');
      expect(subclassed.context).toMatchObject({
        metadata: { filename: '/safe.js', lineno: 1, colno: 2 },
      });
    } finally {
      if (original) Object.defineProperty(globalThis, 'ErrorEvent', original);
      else Reflect.deleteProperty(globalThis, 'ErrorEvent');
    }
  });
});
