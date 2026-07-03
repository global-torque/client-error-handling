import type {
  ClientErrorReporter,
  NormalizedClientError,
} from './types.ts';

export function createMemoryErrorReporter() {
  const reports: NormalizedClientError[] = [];

  return {
    reports,
    report(error: NormalizedClientError) {
      reports.push(error);
    },
    clear() {
      reports.splice(0, reports.length);
    },
  } satisfies ClientErrorReporter & {
    reports: NormalizedClientError[];
    clear(): void;
  };
}

export function createNoopErrorReporter(): ClientErrorReporter {
  return {
    report() {},
  };
}
