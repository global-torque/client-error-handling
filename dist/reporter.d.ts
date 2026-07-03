import type { ClientErrorReporter, NormalizedClientError } from './types.ts';
export declare function createMemoryErrorReporter(): {
    reports: NormalizedClientError[];
    report(error: NormalizedClientError): void;
    clear(): void;
};
export declare function createNoopErrorReporter(): ClientErrorReporter;
//# sourceMappingURL=reporter.d.ts.map