import { sanitizeContext, type SanitizeOptions } from './sanitize.ts';
import type { ClientErrorContext, NormalizedClientError } from './types.ts';

export interface NormalizeClientErrorOptions {
  now?: () => Date;
  sanitize?: SanitizeOptions;
}

function getObjectValue(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }

  return (value as Record<string, unknown>)[key];
}

function getErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name || 'Error';
  }

  const name = getObjectValue(error, 'name');
  return typeof name === 'string' && name.trim() !== '' ? name : 'NonErrorThrown';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name || 'Error';
  }

  const message = getObjectValue(error, 'message');
  if (typeof message === 'string' && message.trim() !== '') {
    return message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }

  const stack = getObjectValue(error, 'stack');
  return typeof stack === 'string' ? stack : undefined;
}

function createFingerprint(name: string, message: string, stack?: string): string {
  const stackLine = stack?.split('\n').find((line) => line.trim().startsWith('at '))?.trim() ?? '';
  return [name, message, stackLine].filter(Boolean).join('|');
}

export function normalizeClientError(
  error: unknown,
  context: ClientErrorContext = {},
  options: NormalizeClientErrorOptions = {},
): NormalizedClientError {
  const name = getErrorName(error);
  const message = getErrorMessage(error);
  const stack = getErrorStack(error);
  const normalized: NormalizedClientError = {
    name,
    message,
    timestamp: (options.now?.() ?? new Date()).toISOString(),
    fingerprint: createFingerprint(name, message, stack),
  };

  if (stack) {
    normalized.stack = stack;
  }

  if (Object.keys(context).length > 0) {
    normalized.context = sanitizeContext(context, options.sanitize);
  }

  return normalized;
}

export function normalizeBrowserErrorEvent(
  event: {
    error?: unknown;
    message?: string;
    filename?: string;
    lineno?: number;
    colno?: number;
  },
  context: ClientErrorContext = {},
  options: NormalizeClientErrorOptions = {},
): NormalizedClientError {
  return normalizeClientError(
    event.error ?? { name: 'ErrorEvent', message: event.message ?? 'Browser error event' },
    {
      ...context,
      metadata: {
        ...context.metadata,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    },
    options,
  );
}

export function normalizeUnhandledRejection(
  reason: unknown,
  context: ClientErrorContext = {},
  options: NormalizeClientErrorOptions = {},
): NormalizedClientError {
  return normalizeClientError(reason, {
    ...context,
    metadata: {
      ...context.metadata,
      unhandledRejection: true,
    },
  }, options);
}
