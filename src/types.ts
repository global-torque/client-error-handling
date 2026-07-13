/** JSON-compatible primitive accepted by transport reporters. @public */
export type SerializablePrimitive = string | number | boolean | null;

/** Recursively JSON-compatible, readonly transport value. @public */
export type SerializableValue =
  | SerializablePrimitive
  | readonly SerializableValue[]
  | { readonly [key: string]: SerializableValue };

/** Host request context. Bodies and unapproved headers are omitted by default. @public */
export interface ClientErrorRequestContext {
  /** Request URL; credentials, query, and fragment are removed by default. */
  readonly url?: string;
  /** Request method retained as bounded text. */
  readonly method?: string;
  /** Candidate headers filtered through `allowedHeaderKeys`. */
  readonly headers?: Readonly<Record<string, unknown>>;
  /** Never retained; accepted only so hosts can pass existing request shapes. */
  readonly body?: unknown;
}

/** Approved browser context fields. @public */
export interface ClientErrorBrowserContext {
  /** Bounded browser user-agent text. */
  readonly userAgent?: string;
  /** Bounded browser language text. */
  readonly language?: string;
  /** Optional numeric viewport dimensions. */
  readonly viewport?: {
    /** CSS viewport width. */
    readonly width?: number;
    /** CSS viewport height. */
    readonly height?: number;
  };
}

/** Host context accepted before allowlist sanitization. @public */
export interface ClientErrorContext {
  /** Current absolute or relative URL. */
  readonly url?: string;
  /** Current route path. */
  readonly route?: string;
  /** Host component or subsystem name. */
  readonly component?: string;
  /** Approved browser facts. */
  readonly browser?: ClientErrorBrowserContext;
  /** Approved request facts; the body is always omitted. */
  readonly request?: ClientErrorRequestContext;
  /** Candidate metadata filtered through `allowedMetadataKeys`. */
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** Unknown top-level fields are intentionally ignored. */
  readonly [key: string]: unknown;
}

/** Bounded normalized cause or aggregate member. @public */
export interface NormalizedErrorDetail {
  /** Sanitized bounded error name. */
  readonly name: string;
  /** Sanitized bounded diagnostic message. */
  readonly message: string;
  /** Sanitized stack frames without the raw first-line message. */
  readonly stack?: string;
  /** Bounded normalized cause. */
  readonly cause?: NormalizedErrorDetail;
  /** Bounded aggregate members. */
  readonly errors?: readonly NormalizedErrorDetail[];
}

/** Deeply frozen, transport-safe client error accepted by reporters. @public */
export interface NormalizedClientError extends NormalizedErrorDetail {
  /** ISO timestamp from the injected or system clock. */
  readonly timestamp: string;
  /** Opaque stable fingerprint calculated from sanitized diagnostics. */
  readonly fingerprint: string;
  /** Allowlisted JSON-compatible host context. */
  readonly context?: SerializableValue;
}

/** Transport sink. It never receives the original diagnostic object. @public */
export interface ClientErrorReporter {
  /** Dispatch one already-normalized transport record. */
  report(error: NormalizedClientError): void | Promise<void>;
}

/** Pipeline terminal status. @public */
export type ClientErrorReportStatus =
  | 'reported'
  | 'deduped'
  | 'rate-limited'
  | 'ignored'
  | 'queue-full'
  | 'reporter-failed'
  | 'normalization-failed'
  | 'pipeline-failed';

/** Typed result returned without exposing the raw diagnostic value. @public */
export interface ClientErrorReportResult {
  /** `true` only when every configured reporter fulfilled. */
  readonly accepted: boolean;
  /** Terminal pipeline outcome. */
  readonly status: ClientErrorReportStatus;
  /** Safe record when normalization occurred. */
  readonly error?: NormalizedClientError;
}
