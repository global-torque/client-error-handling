import type { NormalizedClientError } from './types.js';
export interface DedupeOptions {
    ttlMs?: number;
    maxEntries?: number;
    now?: () => number;
}
export declare function createDedupeFilter({ ttlMs, maxEntries, now, }?: DedupeOptions): {
    accept(error: Pick<NormalizedClientError, "fingerprint">): boolean;
    clear(): void;
    size(): number;
};
//# sourceMappingURL=dedupe.d.ts.map