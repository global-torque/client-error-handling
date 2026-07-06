import { type SanitizeOptions } from './sanitize.ts';
import type { ClientErrorContext, NormalizedClientError } from './types.ts';
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