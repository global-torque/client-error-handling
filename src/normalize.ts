import {
  sanitizeContext,
  sanitizeText,
  sanitizeUrl,
  type SanitizeOptions,
} from './sanitize.js';
import type {
  ClientErrorContext,
  NormalizedClientError,
  NormalizedErrorDetail,
  SerializableValue,
} from './types.js';

/** Error traversal and sanitization policy. @public */
export interface NormalizeClientErrorOptions {
  /** Injectable clock returning a valid `Date`. */
  readonly now?: () => Date;
  /** Sanitizer bounds and allowlists. */
  readonly sanitize?: SanitizeOptions;
  /** Maximum nested cause depth. Defaults to four. */
  readonly maxCauseDepth?: number;
  /** Maximum aggregate members per error. Defaults to ten. */
  readonly maxAggregateErrors?: number;
  /** Maximum retained stack frames. Defaults to twelve. */
  readonly maxStackFrames?: number;
}

interface ResolvedNormalizeOptions {
  readonly now: () => Date;
  readonly sanitize: SanitizeOptions;
  readonly maxCauseDepth: number;
  readonly maxAggregateErrors: number;
  readonly maxStackFrames: number;
  readonly maxTotalBytes: number;
}

interface MutableErrorDetail {
  name: string;
  message: string;
  stack?: string;
  cause?: MutableErrorDetail;
  errors?: MutableErrorDetail[];
}

interface ErrorTraversalState {
  readonly active: WeakSet<object>;
  readonly seen: WeakSet<object>;
  nodes: number;
  readonly maxNodes: number;
}

// eslint-disable-next-line @typescript-eslint/unbound-method -- identity is compared before invocation with Reflect.apply.
const nativeErrorStackGetter = Object.getOwnPropertyDescriptor(
  new Error(),
  'stack',
)?.get;

function positiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
  return resolved;
}

function resolveOptions(
  options: NormalizeClientErrorOptions,
): ResolvedNormalizeOptions {
  const maxTotalBytes = options.sanitize?.maxTotalBytes ?? 16_384;
  if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 256) {
    throw new TypeError(
      'sanitize.maxTotalBytes must be a safe integer of at least 256.',
    );
  }
  const maxCauseDepth = positiveInteger(
    options.maxCauseDepth,
    4,
    'maxCauseDepth',
  );
  const maxAggregateErrors = positiveInteger(
    options.maxAggregateErrors,
    10,
    'maxAggregateErrors',
  );
  return {
    now: options.now ?? (() => new Date()),
    sanitize: options.sanitize ?? {},
    maxCauseDepth,
    maxAggregateErrors,
    maxStackFrames: positiveInteger(
      options.maxStackFrames,
      12,
      'maxStackFrames',
    ),
    maxTotalBytes,
  };
}

function safeDescriptor(
  object: object,
  key: PropertyKey,
): PropertyDescriptor | undefined {
  try {
    return Object.getOwnPropertyDescriptor(object, key);
  } catch {
    return undefined;
  }
}

function safeDataProperty(value: unknown, key: PropertyKey): unknown {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    return undefined;
  }
  let current: object | null = value;
  for (let depth = 0; current !== null && depth < 8; depth += 1) {
    const descriptor = safeDescriptor(current, key);
    if (descriptor) {
      if ('value' in descriptor) return descriptor.value;
      if (
        key === 'stack' &&
        descriptor.get &&
        nativeErrorStackGetter &&
        descriptor.get === nativeErrorStackGetter
      ) {
        try {
          // eslint-disable-next-line @typescript-eslint/unbound-method -- the captured native getter receives its explicit receiver.
          return Reflect.apply(descriptor.get, value, []);
        } catch {
          return undefined;
        }
      }
      return undefined;
    }
    try {
      current = Reflect.getPrototypeOf(current);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function safeArrayItems(
  value: unknown,
  limit: number,
): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value)) return undefined;
  } catch {
    return undefined;
  }
  const length = safeDescriptor(value, 'length');
  if (!length || !('value' in length) || typeof length.value !== 'number') {
    return [];
  }
  const result: unknown[] = [];
  for (let index = 0; index < Math.min(length.value, limit); index += 1) {
    const descriptor = safeDescriptor(value, String(index));
    result.push(
      descriptor && 'value' in descriptor ? descriptor.value : undefined,
    );
  }
  return result;
}

function safeEnumerableDataEntries(
  value: unknown,
): readonly (readonly [string, unknown])[] {
  if (value === null || typeof value !== 'object') return [];
  try {
    return Reflect.ownKeys(value).flatMap((key) => {
      if (typeof key !== 'string') return [];
      const descriptor = safeDescriptor(value, key);
      return descriptor?.enumerable === true && 'value' in descriptor
        ? ([[key, descriptor.value]] as const)
        : [];
    });
  } catch {
    return [];
  }
}

function defineData(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function sanitizeName(value: unknown, options: SanitizeOptions): string {
  const source =
    typeof value === 'string' && value.trim() !== '' ? value : 'Error';
  const sanitized = sanitizeText(source, {
    ...options,
    maxStringLength: Math.min(options.maxStringLength ?? 1_000, 80),
  })
    .replace(/[^A-Za-z0-9_.:$ -]/g, '')
    .trim();
  return sanitized || 'Error';
}

function sanitizeMessage(error: unknown, options: SanitizeOptions): string {
  const message = safeDataProperty(error, 'message');
  if (typeof message === 'string' && message.trim() !== '') {
    return sanitizeText(message, options);
  }
  if (typeof error === 'string' && error.trim() !== '') {
    return sanitizeText(error, options);
  }
  if (error === null) return 'Non-error null value thrown';
  if (error === undefined) return 'Non-error undefined value thrown';
  return `Non-error ${typeof error} value thrown`;
}

function sanitizeStack(
  stack: unknown,
  options: ResolvedNormalizeOptions,
): string | undefined {
  if (typeof stack !== 'string') return undefined;
  const frames = stack
    .split(/\r?\n/)
    .filter((line) => /^\s*at\s+/i.test(line))
    .slice(0, options.maxStackFrames)
    .map((line) => sanitizeText(line.trim(), options.sanitize))
    .filter(Boolean);
  return frames.length > 0 ? frames.join('\n') : undefined;
}

function deepFreeze<T>(value: T, seen = new WeakSet()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  Reflect.ownKeys(value).forEach((key) => {
    const descriptor = safeDescriptor(value, key);
    if (descriptor && 'value' in descriptor) deepFreeze(descriptor.value, seen);
  });
  return Object.freeze(value);
}

function normalizeDetail(
  error: unknown,
  options: ResolvedNormalizeOptions,
  depth: number,
  traversal: ErrorTraversalState,
): MutableErrorDetail {
  traversal.nodes += 1;
  if (traversal.nodes > traversal.maxNodes) {
    return {
      name: 'ErrorBudgetExceeded',
      message: 'Additional error details omitted',
    };
  }
  const objectError =
    error !== null && (typeof error === 'object' || typeof error === 'function')
      ? error
      : undefined;
  if (objectError && traversal.active.has(objectError)) {
    return {
      name: 'CircularError',
      message: 'Circular error reference omitted',
    };
  }
  if (objectError && traversal.seen.has(objectError)) {
    return {
      name: 'SharedError',
      message: 'Shared error reference omitted',
    };
  }
  if (objectError) {
    traversal.seen.add(objectError);
    traversal.active.add(objectError);
  }

  try {
    const rawName = safeDataProperty(error, 'name');
    const rawMessage = safeDataProperty(error, 'message');
    const rawStack = safeDataProperty(error, 'stack');
    const name = sanitizeName(
      rawName ??
        (typeof rawMessage === 'string' || typeof rawStack === 'string'
          ? 'Error'
          : 'NonErrorThrown'),
      options.sanitize,
    );
    const message = sanitizeMessage(error, options.sanitize);
    const stack = sanitizeStack(rawStack, options);
    const detail: MutableErrorDetail = { name, message };
    if (stack) detail.stack = stack;

    if (depth < options.maxCauseDepth) {
      const cause = safeDataProperty(error, 'cause');
      if (cause !== undefined) {
        detail.cause = normalizeDetail(cause, options, depth + 1, traversal);
      }
      const aggregate = safeArrayItems(
        safeDataProperty(error, 'errors'),
        options.maxAggregateErrors,
      );
      if (aggregate) {
        detail.errors = aggregate.map((item) =>
          normalizeDetail(item, options, depth + 1, traversal),
        );
      }
    }
    return detail;
  } finally {
    if (objectError) traversal.active.delete(objectError);
  }
}

function stableFingerprint(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `ceh_${first.toString(16).padStart(8, '0')}${second
    .toString(16)
    .padStart(8, '0')}`;
}

function fingerprintSource(detail: NormalizedErrorDetail): string {
  return JSON.stringify({
    name: detail.name,
    message: detail.message,
    frame: detail.stack?.split('\n')[0] ?? '',
    cause: detail.cause
      ? { name: detail.cause.name, message: detail.cause.message }
      : undefined,
    aggregate: detail.errors?.map(({ name, message }) => ({ name, message })),
  });
}

function timestamp(now: () => Date): string {
  const date = now();
  try {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- the Date intrinsic receives the candidate as its explicit receiver.
    const time = Reflect.apply(Date.prototype.getTime, date, []);
    if (!Number.isFinite(time))
      throw new TypeError('now returned an invalid Date.');
    return new Date(time).toISOString();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('invalid Date')) {
      throw error;
    }
    throw new TypeError('now must return a valid Date.');
  }
}

function hasContext(value: SerializableValue): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

const textEncoder = new TextEncoder();

function serializedBytes(value: unknown): number {
  return textEncoder.encode(JSON.stringify(value)).byteLength;
}

function collectDetails(root: MutableErrorDetail): MutableErrorDetail[] {
  const result: MutableErrorDetail[] = [];
  const visit = (detail: MutableErrorDetail): void => {
    result.push(detail);
    if (detail.cause) visit(detail.cause);
    detail.errors?.forEach(visit);
  };
  visit(root);
  return result;
}

function shrinkNormalizedRecord(
  normalized: MutableErrorDetail & {
    timestamp: string;
    fingerprint: string;
    context?: SerializableValue;
  },
): boolean {
  const details = collectDetails(normalized);
  for (const detail of [...details].reverse()) {
    if (detail.errors && detail.errors.length > 0) {
      detail.errors.pop();
      if (detail.errors.length === 0) delete detail.errors;
      return true;
    }
  }
  for (const detail of [...details].reverse()) {
    if (detail.cause) {
      delete detail.cause;
      return true;
    }
  }
  for (const detail of [...details].reverse()) {
    if (detail.stack) {
      const frames = detail.stack.split('\n');
      frames.pop();
      if (frames.length > 0) detail.stack = frames.join('\n');
      else delete detail.stack;
      return true;
    }
  }
  if (normalized.context !== undefined) {
    delete normalized.context;
    return true;
  }
  const longest = [...details]
    .filter(({ message }) => message.length > 24)
    .sort((left, right) => right.message.length - left.message.length)[0];
  if (longest) {
    longest.message = `${longest.message.slice(
      0,
      Math.max(12, Math.floor(longest.message.length / 2) - 11),
    )}[truncated]`;
    return true;
  }
  return false;
}

function fitNormalizedRecord(
  detail: MutableErrorDetail,
  context: SerializableValue,
  time: string,
  maxTotalBytes: number,
): NormalizedClientError {
  const normalized: MutableErrorDetail & {
    timestamp: string;
    fingerprint: string;
    context?: SerializableValue;
  } = {
    ...detail,
    timestamp: time,
    fingerprint: 'ceh_0000000000000000',
  };
  if (hasContext(context)) normalized.context = context;

  while (serializedBytes(normalized) > maxTotalBytes) {
    if (!shrinkNormalizedRecord(normalized)) {
      normalized.name = 'Error';
      normalized.message = '[payload-too-large]';
      delete normalized.stack;
      delete normalized.cause;
      delete normalized.errors;
      delete normalized.context;
      break;
    }
  }
  normalized.fingerprint = stableFingerprint(fingerprintSource(normalized));
  if (serializedBytes(normalized) > maxTotalBytes) {
    throw new TypeError(
      'sanitize.maxTotalBytes is too small for a normalized error.',
    );
  }
  return deepFreeze(normalized);
}

/** Normalize an unknown diagnostic into a frozen transport-safe record. @public */
export function normalizeClientError(
  error: unknown,
  context: ClientErrorContext = {},
  options: NormalizeClientErrorOptions = {},
): NormalizedClientError {
  const resolved = resolveOptions(options);
  const traversal: ErrorTraversalState = {
    active: new WeakSet(),
    seen: new WeakSet(),
    nodes: 0,
    maxNodes: Math.min(
      256,
      Math.max(16, resolved.maxAggregateErrors * (resolved.maxCauseDepth + 1)),
    ),
  };
  const detail = normalizeDetail(error, resolved, 0, traversal);
  const sanitizedContext = sanitizeContext(context, resolved.sanitize);
  return fitNormalizedRecord(
    detail,
    sanitizedContext,
    timestamp(resolved.now),
    resolved.maxTotalBytes,
  );
}

function eventValue(event: unknown, key: string): unknown {
  const dataValue = safeDataProperty(event, key);
  if (dataValue !== undefined) return dataValue;
  if (event === null || typeof event !== 'object') return undefined;
  const globalDescriptor = safeDescriptor(globalThis, 'ErrorEvent');
  const constructor: unknown =
    globalDescriptor && 'value' in globalDescriptor
      ? (globalDescriptor.value as unknown)
      : undefined;
  if (typeof constructor !== 'function') return undefined;
  try {
    if (!(event instanceof constructor)) return undefined;
  } catch {
    return undefined;
  }
  const prototype = safeDataProperty(constructor, 'prototype');
  if (prototype === null || typeof prototype !== 'object') return undefined;
  const descriptor = safeDescriptor(prototype, key);
  if (!descriptor?.get) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- the exact ErrorEvent prototype getter receives its branded event.
    return Reflect.apply(descriptor.get, event, []);
  } catch {
    return undefined;
  }
}

function augmentContext(
  context: ClientErrorContext,
  additions: Readonly<Record<string, unknown>>,
): ClientErrorContext {
  const result: Record<string, unknown> = {};
  for (const key of ['url', 'route', 'component', 'browser', 'request']) {
    const value = safeDataProperty(context, key);
    if (value !== undefined) result[key] = value;
  }
  const metadata: Record<string, unknown> = {};
  const currentMetadata = safeDataProperty(context, 'metadata');
  for (const [key, value] of safeEnumerableDataEntries(currentMetadata)) {
    defineData(metadata, key, value);
  }
  for (const [key, value] of Object.entries(additions)) {
    defineData(metadata, key, value);
  }
  result.metadata = metadata;
  return result;
}

/** Normalize own fields or verified native `ErrorEvent` WebIDL getters. @public */
export function normalizeBrowserErrorEvent(
  event: unknown,
  context: ClientErrorContext = {},
  options: NormalizeClientErrorOptions = {},
): NormalizedClientError {
  const filename = eventValue(event, 'filename');
  const message = eventValue(event, 'message');
  return normalizeClientError(
    eventValue(event, 'error') ?? {
      name: 'ErrorEvent',
      message:
        typeof message === 'string' ? message : 'Browser error event received',
    },
    augmentContext(context, {
      filename:
        typeof filename === 'string'
          ? sanitizeUrl(filename, options.sanitize)
          : undefined,
      lineno: eventValue(event, 'lineno'),
      colno: eventValue(event, 'colno'),
    }),
    options,
  );
}

/** Normalize an unhandled rejection with an approved event marker. @public */
export function normalizeUnhandledRejection(
  reason: unknown,
  context: ClientErrorContext = {},
  options: NormalizeClientErrorOptions = {},
): NormalizedClientError {
  return normalizeClientError(
    reason,
    augmentContext(context, { unhandledRejection: true }),
    options,
  );
}
