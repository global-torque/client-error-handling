export type SerializablePrimitive = string | number | boolean | null;
export type SerializableValue = SerializablePrimitive | SerializableValue[] | {
    [key: string]: SerializableValue;
};
export interface ClientErrorRequestContext {
    url?: string;
    method?: string;
    headers?: Record<string, unknown>;
    body?: unknown;
}
export interface ClientErrorBrowserContext {
    userAgent?: string;
    language?: string;
    viewport?: {
        width?: number;
        height?: number;
    };
}
export interface ClientErrorContext {
    url?: string;
    route?: string;
    component?: string;
    browser?: ClientErrorBrowserContext;
    request?: ClientErrorRequestContext;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
}
export interface NormalizedClientError {
    name: string;
    message: string;
    stack?: string;
    timestamp: string;
    fingerprint: string;
    context?: SerializableValue;
}
export interface ClientErrorReporter {
    report(error: NormalizedClientError): void | Promise<void>;
}
export interface ClientErrorReportResult {
    accepted: boolean;
    reason?: 'deduped' | 'rate-limited' | 'ignored';
}
//# sourceMappingURL=types.d.ts.map