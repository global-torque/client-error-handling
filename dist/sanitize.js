const DEFAULT_REDACT_VALUE = '[redacted]';
const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_MAX_ARRAY_LENGTH = 25;
const DEFAULT_SENSITIVE_KEYS = [
    /^authorization$/i,
    /^cookie$/i,
    /^set-cookie$/i,
    /^x-api-key$/i,
    /^api[-_]?key$/i,
    /^access[-_]?token$/i,
    /^refresh[-_]?token$/i,
    /^id[-_]?token$/i,
    /^csrf[-_]?token$/i,
    /^password$/i,
    /^passcode$/i,
    /^secret$/i,
    /^client[-_]?secret$/i,
    /^private[-_]?key$/i,
    /^raw[-_]?body$/i,
    /^body$/i,
    /^payload$/i,
    /^mutation$/i,
    /^variables$/i,
];
const DEFAULT_SENSITIVE_QUERY_KEYS = [
    /token/i,
    /secret/i,
    /password/i,
    /api[-_]?key/i,
    /^code$/i,
    /^state$/i,
    /^session/i,
];
function resolveOptions(options = {}) {
    return {
        maxArrayLength: options.maxArrayLength ?? DEFAULT_MAX_ARRAY_LENGTH,
        maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
        redactValue: options.redactValue ?? DEFAULT_REDACT_VALUE,
        sensitiveKeys: options.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS,
        sensitiveQueryKeys: options.sensitiveQueryKeys ?? DEFAULT_SENSITIVE_QUERY_KEYS,
    };
}
function keyMatches(key, patterns) {
    return patterns.some((pattern) => pattern.test(key));
}
function asSerializablePrimitive(value) {
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
        return null;
    }
    if (typeof value === 'string'
        || typeof value === 'number'
        || typeof value === 'boolean'
        || value === null) {
        return value;
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    return String(value);
}
function sanitizeString(value, options) {
    try {
        const parsedUrl = new URL(value);
        let changed = false;
        for (const key of [...parsedUrl.searchParams.keys()]) {
            if (keyMatches(key, options.sensitiveQueryKeys)) {
                parsedUrl.searchParams.set(key, options.redactValue);
                changed = true;
            }
        }
        return changed ? parsedUrl.toString() : value;
    }
    catch {
        return value;
    }
}
export function sanitizeValue(value, options = {}) {
    const resolvedOptions = resolveOptions(options);
    function visit(current, depth, currentKey, seen = new WeakSet()) {
        if (currentKey && keyMatches(currentKey, resolvedOptions.sensitiveKeys)) {
            return resolvedOptions.redactValue;
        }
        if (typeof current === 'string') {
            return sanitizeString(current, resolvedOptions);
        }
        if (current === null
            || typeof current !== 'object') {
            return asSerializablePrimitive(current);
        }
        if (seen.has(current)) {
            return '[circular]';
        }
        if (depth >= resolvedOptions.maxDepth) {
            return '[truncated]';
        }
        seen.add(current);
        if (current instanceof Error) {
            return {
                name: current.name,
                message: current.message,
                stack: current.stack ?? null,
            };
        }
        if (Array.isArray(current)) {
            return current
                .slice(0, resolvedOptions.maxArrayLength)
                .map((item) => visit(item, depth + 1, undefined, seen));
        }
        const sanitized = {};
        for (const [key, child] of Object.entries(current)) {
            sanitized[key] = visit(child, depth + 1, key, seen);
        }
        return sanitized;
    }
    return visit(value, 0);
}
export function sanitizeContext(context, options = {}) {
    return sanitizeValue(context, options);
}
//# sourceMappingURL=sanitize.js.map