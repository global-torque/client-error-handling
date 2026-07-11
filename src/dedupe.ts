import type { NormalizedClientError } from './types.js';

/** Bounded fingerprint dedupe policy. @public */
export interface DedupeOptions {
  /** Exact fingerprint lifetime in milliseconds. Defaults to 60 seconds. */
  readonly ttlMs?: number;
  /** Maximum remembered fingerprints. Defaults to 250. */
  readonly maxEntries?: number;
  /** Injectable finite millisecond clock. */
  readonly now?: () => number;
}

/** Dedupe filter contract. @public */
export interface DedupeFilter {
  /** Remember a new fingerprint, returning `false` for a live duplicate. */
  accept(error: Pick<NormalizedClientError, 'fingerprint'>): boolean;
  /** Remove one fingerprint, for example after a later pipeline gate rejects. */
  forget(fingerprint: string): void;
  /** Remove every remembered fingerprint. */
  clear(): void;
  /** Return the current bounded entry count. */
  size(): number;
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
  return resolved;
}

/** Create an exact-TTL, insertion-ordered bounded dedupe filter. @public */
export function createDedupeFilter(input: DedupeOptions = {}): DedupeFilter {
  const {
    ttlMs: rawTtlMs,
    maxEntries: rawMaxEntries,
    now = () => Date.now(),
  } = input;
  const ttlMs = positiveInteger(rawTtlMs, 60_000, 'ttlMs');
  const maxEntries = positiveInteger(rawMaxEntries, 250, 'maxEntries');
  const seen = new Map<string, number>();

  const currentTime = (): number => {
    const value = now();
    if (!Number.isFinite(value))
      throw new TypeError('now must return a finite number.');
    return value;
  };

  const pruneExpired = (time: number): void => {
    for (const [fingerprint, createdAt] of seen) {
      if (time - createdAt >= ttlMs) seen.delete(fingerprint);
    }
  };

  const pruneCapacity = (): void => {
    while (seen.size >= maxEntries) {
      const oldest = seen.keys().next().value;
      if (oldest === undefined) break;
      seen.delete(oldest);
    }
  };

  return Object.freeze({
    accept(error: Pick<NormalizedClientError, 'fingerprint'>): boolean {
      if (typeof error.fingerprint !== 'string' || error.fingerprint === '') {
        throw new TypeError('fingerprint must be a non-empty string.');
      }
      const time = currentTime();
      pruneExpired(time);
      if (seen.has(error.fingerprint)) return false;
      pruneCapacity();
      seen.set(error.fingerprint, time);
      return true;
    },
    clear(): void {
      seen.clear();
    },
    forget(fingerprint: string): void {
      seen.delete(fingerprint);
    },
    size(): number {
      return seen.size;
    },
  });
}
