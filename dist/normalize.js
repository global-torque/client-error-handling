import { sanitizeContext } from './sanitize.js';
function getObjectValue(value, key) {
    if (value === null || typeof value !== 'object') {
        return undefined;
    }
    return value[key];
}
function getErrorName(error) {
    if (error instanceof Error) {
        return error.name || 'Error';
    }
    const name = getObjectValue(error, 'name');
    return typeof name === 'string' && name.trim() !== '' ? name : 'NonErrorThrown';
}
function getErrorMessage(error) {
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
    }
    catch {
        return String(error);
    }
}
function getErrorStack(error) {
    if (error instanceof Error) {
        return error.stack;
    }
    const stack = getObjectValue(error, 'stack');
    return typeof stack === 'string' ? stack : undefined;
}
function createFingerprint(name, message, stack) {
    const stackLine = stack?.split('\n').find((line) => line.trim().startsWith('at '))?.trim() ?? '';
    return [name, message, stackLine].filter(Boolean).join('|');
}
export function normalizeClientError(error, context = {}, options = {}) {
    const name = getErrorName(error);
    const message = getErrorMessage(error);
    const stack = getErrorStack(error);
    const normalized = {
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
export function normalizeBrowserErrorEvent(event, context = {}, options = {}) {
    return normalizeClientError(event.error ?? { name: 'ErrorEvent', message: event.message ?? 'Browser error event' }, {
        ...context,
        metadata: {
            ...context.metadata,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
        },
    }, options);
}
export function normalizeUnhandledRejection(reason, context = {}, options = {}) {
    return normalizeClientError(reason, {
        ...context,
        metadata: {
            ...context.metadata,
            unhandledRejection: true,
        },
    }, options);
}
//# sourceMappingURL=normalize.js.map