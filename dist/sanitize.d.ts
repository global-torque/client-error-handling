import type { SerializableValue } from './types.js';
export interface SanitizeOptions {
    maxDepth?: number;
    maxArrayLength?: number;
    redactValue?: string;
    sensitiveKeys?: readonly RegExp[];
    sensitiveQueryKeys?: readonly RegExp[];
}
export declare function sanitizeValue(value: unknown, options?: SanitizeOptions): SerializableValue;
export declare function sanitizeContext(context: unknown, options?: SanitizeOptions): SerializableValue;
//# sourceMappingURL=sanitize.d.ts.map