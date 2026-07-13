import type { ClientErrorReporter, NormalizedClientError } from './types.js';

/** Memory reporter configuration for tests and local adapters. @public */
export interface MemoryErrorReporterOptions {
  /** Maximum retained reports. Defaults to 100. */
  readonly maxEntries?: number;
}

/** Bounded readonly memory reporter. @public */
export interface MemoryErrorReporter extends ClientErrorReporter {
  /** Frozen snapshot of retained transport records. */
  readonly reports: readonly NormalizedClientError[];
  /** Remove all retained reports. */
  clear(): void;
}

function freezeClone(error: NormalizedClientError): NormalizedClientError {
  const clone = structuredClone(error);
  const freeze = (value: unknown): void => {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
      return;
    }
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  };
  freeze(clone);
  return clone;
}

/** Create a bounded reporter that never exposes a mutable backing array. @public */
export function createMemoryErrorReporter(
  input: MemoryErrorReporterOptions = {},
): MemoryErrorReporter {
  const { maxEntries = 100 } = input;
  if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
    throw new TypeError('maxEntries must be a positive safe integer.');
  }
  const reports: NormalizedClientError[] = [];
  return Object.freeze({
    get reports(): readonly NormalizedClientError[] {
      return Object.freeze([...reports]);
    },
    report(error: NormalizedClientError): void {
      reports.push(freezeClone(error));
      if (reports.length > maxEntries)
        reports.splice(0, reports.length - maxEntries);
    },
    clear(): void {
      reports.splice(0, reports.length);
    },
  });
}

/** Create a frozen reporter that discards transport-safe records. @public */
export function createNoopErrorReporter(): ClientErrorReporter {
  return Object.freeze({
    report(): void {
      return undefined;
    },
  });
}
