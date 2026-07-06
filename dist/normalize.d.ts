import { type SanitizeOptions } from './sanitize.js';
import type { ClientErrorContext, NormalizedClientError } from './types.js';
export interface NormalizeClientErrorOptions {
    now?: () => Date;
    sanitize?: SanitizeOptions;
}
export declare function normalizeClientError(error: unknown, context?: ClientErrorContext, options?: NormalizeClientErrorOptions): NormalizedClientError;
export declare function normalizeBrowserErrorEvent(event: {
    error?: unknown;
    message?: string;
    filename?: string;
    lineno?: number;
    colno?: number;
}, context?: ClientErrorContext, options?: NormalizeClientErrorOptions): NormalizedClientError;
export declare function normalizeUnhandledRejection(reason: unknown, context?: ClientErrorContext, options?: NormalizeClientErrorOptions): NormalizedClientError;
//# sourceMappingURL=normalize.d.ts.map