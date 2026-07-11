import { createDedupeFilter, type DedupeOptions } from './dedupe.js';
import {
  normalizeClientError,
  type NormalizeClientErrorOptions,
} from './normalize.js';
import { createNoopErrorReporter } from './reporter.js';
import type {
  ClientErrorContext,
  ClientErrorReporter,
  ClientErrorReportResult,
  NormalizedClientError,
} from './types.js';

/** Fixed-window rate limit policy. @public */
export interface ClientErrorRateLimitOptions {
  /** Maximum accepted reports in one fixed window. */
  readonly maxReports: number;
  /** Fixed-window duration in milliseconds. */
  readonly intervalMs: number;
  /** Injectable finite millisecond clock. */
  readonly now?: () => number;
}

/** Cohesive client-error pipeline policy. @public */
export interface ClientErrorPipelineOptions {
  /** One or more sinks; defaults to a no-op reporter. */
  readonly reporters?: readonly ClientErrorReporter[];
  /** Normalization and sanitizer policy. */
  readonly normalize?: NormalizeClientErrorOptions;
  /** Host classification invoked before normalization. */
  readonly ignore?: (error: unknown, context: ClientErrorContext) => boolean;
  /** Dedupe policy, or `false` to disable it. */
  readonly dedupe?: false | DedupeOptions;
  /** Fixed-window rate policy, or `false` to disable it. */
  readonly rateLimit?: false | ClientErrorRateLimitOptions;
  /** Maximum concurrently pending reporter batches. Defaults to 50. */
  readonly maxQueueSize?: number;
}

/** Bounded reporting pipeline. @public */
export interface ClientErrorPipeline {
  /** Normalize and conditionally dispatch one raw host diagnostic. */
  report(
    error: unknown,
    context?: ClientErrorContext,
  ): Promise<ClientErrorReportResult>;
  /** Wait for every currently accepted reporter batch to settle. */
  flush(): Promise<void>;
  /** Clear dedupe and rate-limit state without cancelling reporters. */
  clear(): void;
  /** Return the current number of reporter batches in flight. */
  pending(): number;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
  return value;
}

function frozenResult(
  status: ClientErrorReportResult['status'],
  error?: NormalizedClientError,
): ClientErrorReportResult {
  return Object.freeze({
    accepted: status === 'reported',
    status,
    ...(error ? { error } : {}),
  });
}

function isReporter(value: unknown): value is ClientErrorReporter {
  try {
    return (
      value !== null &&
      (typeof value === 'object' || typeof value === 'function') &&
      typeof (value as { readonly report?: unknown }).report === 'function'
    );
  } catch {
    return false;
  }
}

/** Create a bounded ignore/dedupe/rate/backpressure/reporting pipeline. @public */
export function createClientErrorPipeline(
  options: ClientErrorPipelineOptions = {},
): ClientErrorPipeline {
  const reporters = Object.freeze([
    ...(options.reporters ?? [createNoopErrorReporter()]),
  ]);
  if (reporters.length === 0 || !reporters.every(isReporter)) {
    throw new TypeError('At least one valid reporter is required.');
  }
  const maxQueueSize = positiveInteger(
    options.maxQueueSize ?? 50,
    'maxQueueSize',
  );
  const dedupe =
    options.dedupe === false ? undefined : createDedupeFilter(options.dedupe);
  const rateLimit = options.rateLimit === false ? undefined : options.rateLimit;
  let rateWindowStartedAt: number | undefined;
  let rateWindowCount = 0;
  if (rateLimit) {
    positiveInteger(rateLimit.maxReports, 'rateLimit.maxReports');
    positiveInteger(rateLimit.intervalMs, 'rateLimit.intervalMs');
  }
  const pendingReports = new Set<Promise<unknown>>();

  const rateTime = (): number => {
    const value = rateLimit?.now?.() ?? Date.now();
    if (!Number.isFinite(value)) {
      throw new TypeError('rateLimit.now must return a finite number.');
    }
    return value;
  };

  const rateAccepted = (): boolean => {
    if (!rateLimit) return true;
    const now = rateTime();
    if (
      rateWindowStartedAt === undefined ||
      now < rateWindowStartedAt ||
      now - rateWindowStartedAt >= rateLimit.intervalMs
    ) {
      rateWindowStartedAt = now;
      rateWindowCount = 0;
    }
    if (rateWindowCount >= rateLimit.maxReports) return false;
    rateWindowCount += 1;
    return true;
  };

  return Object.freeze({
    async report(
      error: unknown,
      context: ClientErrorContext = {},
    ): Promise<ClientErrorReportResult> {
      let ignored = false;
      try {
        ignored = options.ignore?.(error, context) === true;
      } catch {
        ignored = false;
      }
      if (ignored) return frozenResult('ignored');

      let normalized: NormalizedClientError;
      try {
        normalized = normalizeClientError(error, context, options.normalize);
      } catch {
        return frozenResult('normalization-failed');
      }
      if (pendingReports.size >= maxQueueSize) {
        return frozenResult('queue-full', normalized);
      }
      try {
        if (dedupe && !dedupe.accept(normalized)) {
          return frozenResult('deduped', normalized);
        }
      } catch {
        return frozenResult('pipeline-failed', normalized);
      }
      let withinRateLimit: boolean;
      try {
        withinRateLimit = rateAccepted();
      } catch {
        dedupe?.forget(normalized.fingerprint);
        return frozenResult('pipeline-failed', normalized);
      }
      if (!withinRateLimit) {
        dedupe?.forget(normalized.fingerprint);
        return frozenResult('rate-limited', normalized);
      }

      const task = Promise.allSettled(
        reporters.map(async (reporter) => reporter.report(normalized)),
      );
      pendingReports.add(task);
      try {
        const results = await task;
        const rejected = results.filter(({ status }) => status === 'rejected');
        if (rejected.length > 0) {
          if (rejected.length === results.length) {
            dedupe?.forget(normalized.fingerprint);
          }
          return frozenResult('reporter-failed', normalized);
        }
        return frozenResult('reported', normalized);
      } finally {
        pendingReports.delete(task);
      }
    },
    async flush(): Promise<void> {
      await Promise.allSettled([...pendingReports]);
    },
    clear(): void {
      dedupe?.clear();
      rateWindowStartedAt = undefined;
      rateWindowCount = 0;
    },
    pending(): number {
      return pendingReports.size;
    },
  });
}
