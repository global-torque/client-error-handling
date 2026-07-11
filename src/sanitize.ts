import type { SerializableValue } from './types.js';

/** Bounds and allowlists applied before any value reaches a reporter. @public */
export interface SanitizeOptions {
  /** Maximum recursive depth. Defaults to six. */
  readonly maxDepth?: number;
  /** Maximum array, map, or set entries. Defaults to 25. */
  readonly maxArrayLength?: number;
  /** Maximum enumerable keys per object. Defaults to 40. */
  readonly maxObjectKeys?: number;
  /** Maximum characters per retained string. Defaults to 1,000. */
  readonly maxStringLength?: number;
  /** Maximum UTF-8 bytes for the final value. Defaults to 16 KiB. */
  readonly maxTotalBytes?: number;
  /** Non-empty replacement marker. Defaults to `[redacted]`. */
  readonly redactValue?: string;
  /** Exact host-known canary values to replace. */
  readonly redactValues?: readonly string[];
  /** Object-key patterns that force value redaction. */
  readonly sensitiveKeys?: readonly RegExp[];
  /** Retained-query key patterns that force value redaction. */
  readonly sensitiveQueryKeys?: readonly RegExp[];
  /** Metadata keys permitted in transport context. */
  readonly allowedMetadataKeys?: readonly string[] | ReadonlySet<string>;
  /** Case-insensitive request header keys permitted in transport context. */
  readonly allowedHeaderKeys?: readonly string[] | ReadonlySet<string>;
  /** Preserve non-sensitive URL query values. Defaults to `false`. */
  readonly allowUrlQuery?: boolean;
  /** Preserve URL fragments. Defaults to `false`. */
  readonly allowUrlFragment?: boolean;
}

interface ResolvedSanitizeOptions {
  readonly maxDepth: number;
  readonly maxArrayLength: number;
  readonly maxObjectKeys: number;
  readonly maxStringLength: number;
  readonly maxTotalBytes: number;
  readonly redactValue: string;
  readonly redactValues: readonly string[];
  readonly sensitiveKeys: readonly RegExp[];
  readonly sensitiveQueryKeys: readonly RegExp[];
  readonly allowedMetadataKeys: ReadonlySet<string>;
  readonly allowedHeaderKeys: ReadonlySet<string>;
  readonly allowUrlQuery: boolean;
  readonly allowUrlFragment: boolean;
}

const DEFAULT_SENSITIVE_KEYS = [
  /^authorization$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /^x-api-key$/i,
  /^api[-_]?key$/i,
  /token/i,
  /^csrf/i,
  /^password$/i,
  /^passcode$/i,
  /secret/i,
  /private[-_]?key/i,
  /body/i,
  /payload/i,
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
const DEFAULT_METADATA_KEYS = [
  'source',
  'operation',
  'code',
  'filename',
  'lineno',
  'colno',
  'unhandledRejection',
  'silent',
  'retryable',
];
const DEFAULT_HEADER_KEYS = [
  'content-type',
  'x-request-id',
  'traceparent',
  'tracestate',
];
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const textEncoder = new TextEncoder();

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

function clonePatterns(patterns: readonly RegExp[], name: string): RegExp[] {
  return patterns.map((pattern) => {
    if (!(pattern instanceof RegExp)) {
      throw new TypeError(`${name} entries must be regular expressions.`);
    }
    return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
  });
}

function resolveOptions(
  options: SanitizeOptions = {},
): ResolvedSanitizeOptions {
  const redactValue = options.redactValue ?? '[redacted]';
  if (typeof redactValue !== 'string' || redactValue.length === 0) {
    throw new TypeError('redactValue must be a non-empty string.');
  }
  const redactValues = (options.redactValues ?? [])
    .filter(
      (value): value is string => typeof value === 'string' && value !== '',
    )
    .sort((left, right) => right.length - left.length);
  return {
    maxDepth: positiveInteger(options.maxDepth, 6, 'maxDepth'),
    maxArrayLength: positiveInteger(
      options.maxArrayLength,
      25,
      'maxArrayLength',
    ),
    maxObjectKeys: positiveInteger(options.maxObjectKeys, 40, 'maxObjectKeys'),
    maxStringLength: positiveInteger(
      options.maxStringLength,
      1_000,
      'maxStringLength',
    ),
    maxTotalBytes: positiveInteger(
      options.maxTotalBytes,
      16_384,
      'maxTotalBytes',
    ),
    redactValue,
    redactValues,
    sensitiveKeys: clonePatterns(
      options.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS,
      'sensitiveKeys',
    ),
    sensitiveQueryKeys: clonePatterns(
      options.sensitiveQueryKeys ?? DEFAULT_SENSITIVE_QUERY_KEYS,
      'sensitiveQueryKeys',
    ),
    allowedMetadataKeys: new Set([
      ...(options.allowedMetadataKeys ?? DEFAULT_METADATA_KEYS),
    ]),
    allowedHeaderKeys: new Set(
      [...(options.allowedHeaderKeys ?? DEFAULT_HEADER_KEYS)].map((key) =>
        key.toLowerCase(),
      ),
    ),
    allowUrlQuery: options.allowUrlQuery === true,
    allowUrlFragment: options.allowUrlFragment === true,
  };
}

function keyMatches(key: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(key));
}

function redactKnownSecrets(
  value: string,
  options: ResolvedSanitizeOptions,
): string {
  let result = value;
  for (const secret of options.redactValues) {
    result = result.replaceAll(secret, options.redactValue);
  }
  return result
    .replace(
      /\b(bearer|basic)\s+[^\s,;]+/gi,
      (_, scheme: string) => `${scheme} ${options.redactValue}`,
    )
    .replace(
      /["']?\b(token|secret|password|passcode|api[-_ ]?key|authorization)\b["']?\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;&}]+)/gi,
      (_, key: string) => `${key}=${options.redactValue}`,
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      options.redactValue,
    );
}

function isAsciiLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isEmailLocalCharacter(code: number): boolean {
  return (
    isAsciiLetter(code) ||
    (code >= 48 && code <= 57) ||
    code === 37 ||
    code === 43 ||
    code === 45 ||
    code === 46 ||
    code === 95
  );
}

function isEmailDomainCharacter(code: number): boolean {
  return (
    isAsciiLetter(code) ||
    (code >= 48 && code <= 57) ||
    code === 45 ||
    code === 46
  );
}

function redactEmailAddresses(value: string, replacement: string): string {
  let copiedThrough = 0;
  let searchFrom = 0;
  let redacted = '';

  while (searchFrom < value.length) {
    const at = value.indexOf('@', searchFrom);
    if (at === -1) break;

    let start = at;
    while (
      start > copiedThrough &&
      isEmailLocalCharacter(value.charCodeAt(start - 1))
    ) {
      start -= 1;
    }
    if (start === at) {
      searchFrom = at + 1;
      continue;
    }

    let cursor = at + 1;
    let lastDot = -1;
    let tldLetters = 0;
    let tldContainsOnlyLetters = true;
    let validEnd = -1;
    while (
      cursor < value.length &&
      isEmailDomainCharacter(value.charCodeAt(cursor))
    ) {
      const code = value.charCodeAt(cursor);
      if (code === 46) {
        lastDot = cursor;
        tldLetters = 0;
        tldContainsOnlyLetters = true;
      } else if (lastDot >= at + 2) {
        if (tldContainsOnlyLetters && isAsciiLetter(code)) {
          tldLetters += 1;
          if (tldLetters >= 2) validEnd = cursor + 1;
        } else {
          tldContainsOnlyLetters = false;
        }
      }
      cursor += 1;
    }

    if (validEnd === -1) {
      searchFrom = at + 1;
      continue;
    }

    redacted += value.slice(copiedThrough, start) + replacement;
    copiedThrough = validEnd;
    searchFrom = cursor;
  }

  return redacted + value.slice(copiedThrough);
}

function redactPersonalData(
  value: string,
  options: ResolvedSanitizeOptions,
): string {
  return redactEmailAddresses(value, options.redactValue).replace(
    /\b(?:\d[\s-]?){10,}\d?\b/g,
    options.redactValue,
  );
}

function redactInspectableText(
  value: string,
  options: ResolvedSanitizeOptions,
): string {
  return redactPersonalData(redactKnownSecrets(value, options), options);
}

const MAX_URL_DECODE_PASSES = 16;
const MAX_AMBIGUOUS_URL_INSPECTION_LENGTH = 1_024;
const ABSOLUTE_TEXT_URL_PATTERN =
  /(?:(?:https?|ftp|file|ws|wss|javascript|data|mailto|tel):(?:(?:\/\/|\\\\))?|[a-z][a-z\d+.-]*:(?:\/\/|\\\\)|\/\/|\\\\)[^\s<>"']+/i;
const IMMEDIATE_ABSOLUTE_URL_PATTERN =
  /^\s+["'`<]?(?:(?:https?|ftp|file|ws|wss|javascript|data|mailto|tel):(?:(?:\/\/|\\\\))?|[a-z][a-z\d+.-]*:(?:\/\/|\\\\)|\/\/|\\\\)/iu;
const RAW_TEXT_URL_PATTERN =
  /(?:(?:https?|ftp|file|ws|wss|javascript|data|mailto|tel):(?:(?:\/\/|\\\\))?|[a-z][a-z\d+.-]*:(?:\/\/|\\\\)|\/\/|\\\\|(?<![\p{L}\p{N}\p{M}\p{Pc}\p{S}./\\-])(?:\.\.?\/|\/))[^\s]+/iu;
const RAW_TEXT_URLS_PATTERN =
  /(?:(?:https?|ftp|file|ws|wss|javascript|data|mailto|tel):(?:(?:\/\/|\\\\))?|[a-z][a-z\d+.-]*:(?:\/\/|\\\\)|\/\/|\\\\|(?<![\p{L}\p{N}\p{M}\p{Pc}\p{S}./\\-])(?:\.\.?\/|\/))[^\s]+/giu;
const RAW_URL_START_PATTERN =
  /(?:(?:https?|ftp|file|ws|wss|javascript|data|mailto|tel):(?:(?:\/\/|\\\\))?|[a-z][a-z\d+.-]*:(?:\/\/|\\\\)|\/\/|\\\\|(?<![\p{L}\p{N}\p{M}\p{Pc}\p{S}./\\-])(?:\.\.?\/|\/))/iu;
const RAW_CREDENTIAL_URLS_PATTERN =
  /(?:(?:https?|ftp|file|ws|wss):[/\\]{0,2}|[a-z][a-z\d+.-]*:[/\\]{2}|[/\\]{2})[^:@/?#\\]*(?::[^@/?#\\]*)?@[^\s/?#\\]+[^\s]*/giu;
const RAW_URLS_PATTERN = new RegExp(
  `${RAW_CREDENTIAL_URLS_PATTERN.source}|${RAW_TEXT_URLS_PATTERN.source}`,
  'giu',
);
const PERCENT_ENCODED_TEXT_PATTERN = /[^\s]*%[^\s]{2}[^\s]*/i;
const ASCII_PERCENT_ESCAPE_PATTERN = /%([0-7][0-9a-f])/gi;
const SANITIZED_URL_MARKER_BOUNDARY = '\u000b';

function splitRawUrlWrapper(
  candidate: string,
  precedingCharacter: string | undefined,
): readonly [url: string, suffix: string] {
  const closer =
    precedingCharacter === '<'
      ? '>'
      : precedingCharacter === '"' ||
          precedingCharacter === "'" ||
          precedingCharacter === '`'
        ? precedingCharacter
        : undefined;
  if (closer === undefined) return [candidate, ''];
  const closeOffset = candidate.lastIndexOf(closer);
  const suffix = candidate.slice(closeOffset + 1);
  return closeOffset < 0 || !/^[>,.;:!)\]}]*$/u.test(suffix)
    ? [candidate, '']
    : [candidate.slice(0, closeOffset), candidate.slice(closeOffset)];
}

function hasEmbeddedUrl(value: string): boolean {
  return ABSOLUTE_TEXT_URL_PATTERN.test(value);
}

function hasAmbiguousWhitespaceUrl(value: string): boolean {
  const starts = new RegExp(RAW_URL_START_PATTERN.source, 'giu');
  let coveredUntil = 0;
  for (const match of value.matchAll(starts)) {
    const start = match.index;
    if (start < coveredUntil) continue;
    const windowEnd = Math.min(
      value.length,
      start + match[0].length + MAX_AMBIGUOUS_URL_INSPECTION_LENGTH,
    );
    const window = value.slice(start, windowEnd);
    const firstWhitespaceOffset = window.search(/\s/u);
    const firstToken = window.slice(
      0,
      firstWhitespaceOffset < 0 ? window.length : firstWhitespaceOffset,
    );
    const [wrappedCandidate, wrapperSuffix] = splitRawUrlWrapper(
      firstToken,
      value[start - 1],
    );
    const wrapperClosed = wrapperSuffix !== '';
    const candidate = wrapperClosed ? wrappedCandidate : window;
    const remainder = candidate.slice(match[0].length);
    const whitespaceOffset = remainder.search(/\s/u);
    coveredUntil =
      start +
      match[0].length +
      (whitespaceOffset < 0 ? remainder.length : whitespaceOffset);
    if (whitespaceOffset < 0 && !wrapperClosed && windowEnd < value.length) {
      return true;
    }
    if (whitespaceOffset < 0) continue;
    const beforeWhitespace = remainder.slice(0, whitespaceOffset);
    const afterWhitespace = remainder.slice(whitespaceOffset);
    if (
      /[?#]/u.test(beforeWhitespace) &&
      /^\s+\S/u.test(afterWhitespace) &&
      !IMMEDIATE_ABSOLUTE_URL_PATTERN.test(afterWhitespace)
    ) {
      return true;
    }
    if (/^\s+[?#]/u.test(afterWhitespace)) return true;
    const pathContinuation = /^((?:\s+[^\s?#]+)+)\s*[?#]/u.exec(
      afterWhitespace,
    );
    const pathSpan = pathContinuation?.[1];
    if (
      pathSpan !== undefined &&
      !IMMEDIATE_ABSOLUTE_URL_PATTERN.test(afterWhitespace)
    ) {
      return true;
    }
    if (!wrapperClosed && windowEnd < value.length) return true;
  }
  return false;
}

function redactEncodedText(
  value: string,
  options: ResolvedSanitizeOptions,
): string {
  let inspected = value;
  let exhausted = true;
  for (let pass = 0; pass < MAX_URL_DECODE_PASSES; pass += 1) {
    const decoded = inspected.replace(
      ASCII_PERCENT_ESCAPE_PATTERN,
      (_, hexadecimal: string) =>
        String.fromCharCode(Number.parseInt(hexadecimal, 16)),
    );
    if (decoded === inspected) {
      exhausted = false;
      break;
    }
    inspected = decoded;
    if (
      hasEmbeddedUrl(inspected) ||
      redactInspectableText(inspected, options) !== inspected
    ) {
      return options.redactValue;
    }
  }
  if (exhausted) return options.redactValue;
  if (!PERCENT_ENCODED_TEXT_PATTERN.test(inspected)) return value;
  let decoded: string;
  try {
    decoded = decodeURIComponent(inspected);
  } catch {
    return options.redactValue;
  }
  return RAW_TEXT_URL_PATTERN.test(decoded) ||
    redactInspectableText(decoded, options) !== decoded
    ? options.redactValue
    : value;
}

function decodeUrlComponent(value: string): string | undefined {
  let current = value;
  // Each successful non-stable pass consumes at least one three-byte percent
  // escape, so the input length also supplies a hard upper bound.
  const passLimit = Math.min(
    MAX_URL_DECODE_PASSES,
    Math.floor(value.length / 2) + 1,
  );
  for (let pass = 0; pass < passLimit; pass += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return undefined;
    }
    if (decoded === current) return current;
    current = decoded;
  }

  // More encoded layers than the bounded inspection budget are ambiguous.
  // Redact the entire component instead of returning partially inspected data.
  return undefined;
}

function truncateText(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value;
  const marker = '[truncated]';
  return maximumLength <= marker.length
    ? marker.slice(0, maximumLength)
    : `${value.slice(0, maximumLength - marker.length)}${marker}`;
}

function inspectionLimit(options: ResolvedSanitizeOptions): number {
  const longestSecret = options.redactValues.reduce(
    (maximum, secret) => Math.max(maximum, secret.length),
    0,
  );
  return Math.max(
    options.maxStringLength * 4,
    options.maxStringLength + longestSecret,
  );
}

function canonicalizePercentEscapes(value: string): string {
  return value.replace(/%[0-9a-f]{2}/gi, (escape) => escape.toUpperCase());
}

function sanitizeUrlResolved(
  value: string,
  resolved: ResolvedSanitizeOptions,
): string {
  if (value.length > inspectionLimit(resolved)) {
    return truncateText('[truncated]', resolved.maxStringLength);
  }
  const urlRedactionOptions: ResolvedSanitizeOptions = {
    ...resolved,
    redactValue: encodeURIComponent(resolved.redactValue),
    redactValues: resolved.redactValues.flatMap((secret) => [
      secret,
      encodeURIComponent(secret),
    ]),
  };
  const sanitized = canonicalizePercentEscapes(
    sanitizeUrlWithOptions(value, resolved),
  );
  const inspected = redactPersonalData(
    redactKnownSecrets(sanitized, urlRedactionOptions),
    urlRedactionOptions,
  );
  return truncateText(inspected, resolved.maxStringLength);
}

function sanitizeUrlWithOptions(
  value: string,
  options: ResolvedSanitizeOptions,
): string {
  try {
    const scheme = /^([a-z][a-z\d+.-]*):/i.exec(value)?.[1]?.toLowerCase();
    if (scheme && scheme !== 'http' && scheme !== 'https') {
      return '[unsupported-url]';
    }
    const absolute = scheme !== undefined;
    const protocolRelative = value.startsWith('//');
    const bareRelative =
      !absolute &&
      !protocolRelative &&
      !value.startsWith('/') &&
      !value.startsWith('./') &&
      !value.startsWith('../');
    const url = absolute
      ? new URL(value)
      : new URL(value, 'https://sanitizer.invalid/');
    url.username = '';
    url.password = '';
    const decodedPath = decodeUrlComponent(url.pathname);
    if (
      decodedPath === undefined ||
      hasEmbeddedUrl(decodedPath) ||
      redactInspectableText(decodedPath, options) !== decodedPath
    ) {
      url.pathname = `/${encodeURIComponent(options.redactValue)}`;
    }
    if (options.allowUrlQuery) {
      const inspected = new URLSearchParams();
      for (const [key, rawValue] of url.searchParams) {
        const decodedKey = decodeUrlComponent(key);
        const decodedValue = decodeUrlComponent(rawValue);
        const formDecodedKey = decodedKey?.replaceAll('+', ' ');
        const formDecodedValue = decodedValue?.replaceAll('+', ' ');
        const safeKey =
          decodedKey !== undefined &&
          formDecodedKey !== undefined &&
          !decodedKey.includes('+') &&
          !hasEmbeddedUrl(decodedKey) &&
          !hasEmbeddedUrl(formDecodedKey) &&
          redactInspectableText(decodedKey, options) === decodedKey &&
          redactInspectableText(formDecodedKey, options) === formDecodedKey
            ? key
            : options.redactValue;
        const safeValue =
          decodedKey === undefined ||
          decodedValue === undefined ||
          formDecodedKey === undefined ||
          formDecodedValue === undefined ||
          decodedKey.includes('+') ||
          decodedValue.includes('+') ||
          hasEmbeddedUrl(decodedValue) ||
          hasEmbeddedUrl(formDecodedValue) ||
          keyMatches(decodedKey, options.sensitiveQueryKeys) ||
          keyMatches(formDecodedKey, options.sensitiveQueryKeys) ||
          redactInspectableText(decodedValue, options) !== decodedValue ||
          redactInspectableText(formDecodedValue, options) !== formDecodedValue
            ? options.redactValue
            : rawValue;
        inspected.append(safeKey, safeValue);
      }
      url.search = inspected.toString();
    } else {
      url.search = '';
    }
    if (options.allowUrlFragment) {
      const encodedFragment = url.hash.slice(1);
      const decodedFragment = decodeUrlComponent(encodedFragment);
      url.hash =
        decodedFragment === undefined ||
        hasEmbeddedUrl(decodedFragment) ||
        redactInspectableText(decodedFragment, options) !== decodedFragment
          ? options.redactValue
          : encodedFragment;
    } else {
      url.hash = '';
    }

    if (absolute) return url.toString();
    if (protocolRelative) {
      return `//${url.host}${url.pathname}${url.search}${url.hash}`;
    }
    const relative = `${url.pathname}${url.search}${url.hash}`;
    return bareRelative ? relative.replace(/^\//, '') : relative;
  } catch {
    return '[invalid-url]';
  }
}

/** Strip credentials and bounded sensitive URL/text material. @public */
export function sanitizeText(
  value: string,
  options: SanitizeOptions = {},
): string {
  const resolved = resolveOptions(options);
  if (value.length > inspectionLimit(resolved)) {
    return truncateText('[truncated]', resolved.maxStringLength);
  }
  const knownSecretsRedacted = redactKnownSecrets(value, resolved);
  if (hasAmbiguousWhitespaceUrl(knownSecretsRedacted)) {
    return truncateText(resolved.redactValue, resolved.maxStringLength);
  }
  let markerNonce = 0;
  const markerStem = (nonce: number) =>
    `${SANITIZED_URL_MARKER_BOUNDARY}gt-sanitized-url-${String(nonce)}-`;
  while (
    knownSecretsRedacted.includes(markerStem(markerNonce)) ||
    resolved.redactValue.includes(markerStem(markerNonce))
  ) {
    markerNonce += 1;
  }
  const markerPrefix = markerStem(markerNonce);
  const sanitizedUrls: { readonly marker: string; readonly value: string }[] =
    [];
  const protectUrl = (candidate: string, offset: number, original: string) => {
    const [url, suffix] = splitRawUrlWrapper(candidate, original[offset - 1]);
    const marker = `${markerPrefix}${String(sanitizedUrls.length)}${SANITIZED_URL_MARKER_BOUNDARY}`;
    sanitizedUrls.push({ marker, value: sanitizeUrlResolved(url, resolved) });
    return `${marker}${suffix}`;
  };
  const protectedText = knownSecretsRedacted.replace(
    RAW_URLS_PATTERN,
    protectUrl,
  );
  const inspectedParts: string[] = [];
  let inspectedOffset = 0;
  for (const sanitizedUrl of sanitizedUrls) {
    const markerOffset = protectedText.indexOf(
      sanitizedUrl.marker,
      inspectedOffset,
    );
    inspectedParts.push(
      redactEncodedText(
        protectedText.slice(inspectedOffset, markerOffset),
        resolved,
      ),
      sanitizedUrl.marker,
    );
    inspectedOffset = markerOffset + sanitizedUrl.marker.length;
  }
  inspectedParts.push(
    redactEncodedText(protectedText.slice(inspectedOffset), resolved),
  );
  let redacted = redactPersonalData(inspectedParts.join(''), resolved);
  for (const sanitizedUrl of sanitizedUrls) {
    redacted = redacted.replaceAll(sanitizedUrl.marker, sanitizedUrl.value);
  }
  return truncateText(redacted, resolved.maxStringLength);
}

/** Strip credentials, query, and fragment data from an absolute or relative URL. @public */
export function sanitizeUrl(
  value: string,
  options: SanitizeOptions = {},
): string {
  const resolved = resolveOptions(options);
  return sanitizeUrlResolved(value, resolved);
}

function safeOwnDescriptor(
  object: object,
  key: PropertyKey,
): PropertyDescriptor | undefined {
  try {
    return Object.getOwnPropertyDescriptor(object, key);
  } catch {
    return undefined;
  }
}

function ownDataValue(object: object, key: PropertyKey): unknown {
  const descriptor = safeOwnDescriptor(object, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function ownEnumerableKeys(object: object): readonly string[] | null {
  try {
    return Reflect.ownKeys(object)
      .filter((key): key is string => typeof key === 'string')
      .filter((key) => safeOwnDescriptor(object, key)?.enumerable === true);
  } catch {
    return null;
  }
}

function defineSafe(
  target: Record<string, SerializableValue>,
  key: string,
  value: SerializableValue,
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function finalizeBudget(
  value: SerializableValue,
  options: ResolvedSanitizeOptions,
): SerializableValue {
  try {
    if (
      textEncoder.encode(JSON.stringify(value)).byteLength <=
      options.maxTotalBytes
    ) {
      return value;
    }
    const marker = '[payload-too-large]';
    return textEncoder.encode(JSON.stringify(marker)).byteLength <=
      options.maxTotalBytes
      ? marker
      : options.maxTotalBytes >= 2
        ? ''
        : 0;
  } catch {
    const marker = '[unserializable]';
    return textEncoder.encode(JSON.stringify(marker)).byteLength <=
      options.maxTotalBytes
      ? marker
      : options.maxTotalBytes >= 2
        ? ''
        : 0;
  }
}

/* eslint-disable @typescript-eslint/unbound-method -- native intrinsics are always invoked with an explicit branded receiver. */
function intrinsicUrlString(value: URL): string {
  return Reflect.apply(URL.prototype.toString, value, []);
}

function intrinsicMapEntries(
  value: Map<unknown, unknown>,
): IterableIterator<[unknown, unknown]> {
  return Reflect.apply(Map.prototype.entries, value, []);
}

function intrinsicSetValues(value: Set<unknown>): IterableIterator<unknown> {
  return Reflect.apply(Set.prototype.values, value, []);
}
/* eslint-enable @typescript-eslint/unbound-method */

/** Exception-safe bounded sanitization for arbitrary structured values. @public */
export function sanitizeValue(
  value: unknown,
  options: SanitizeOptions = {},
): SerializableValue {
  const resolved = resolveOptions(options);
  const seen = new WeakSet();
  const active = new WeakSet();
  let nodes = 0;
  const maxNodes = Math.max(
    resolved.maxObjectKeys,
    resolved.maxObjectKeys * resolved.maxDepth,
  );

  const visit = (current: unknown, depth: number): SerializableValue => {
    nodes += 1;
    if (nodes > maxNodes) return '[node-budget-exceeded]';
    if (current === null) return null;
    if (typeof current === 'string') return sanitizeText(current, resolved);
    if (typeof current === 'boolean') return current;
    if (typeof current === 'number') {
      return Number.isFinite(current) ? current : `[${String(current)}]`;
    }
    if (typeof current === 'bigint') return `${String(current)}n`;
    if (
      current === undefined ||
      typeof current === 'function' ||
      typeof current === 'symbol'
    ) {
      return null;
    }
    if (depth >= resolved.maxDepth) return '[depth-truncated]';
    if (active.has(current)) return '[circular]';
    if (seen.has(current)) return '[shared]';
    seen.add(current);
    active.add(current);

    try {
      if (current instanceof Date) {
        try {
          // eslint-disable-next-line @typescript-eslint/unbound-method -- the Date intrinsic receives the candidate as its explicit receiver.
          const timestamp = Reflect.apply(Date.prototype.getTime, current, []);
          return Number.isFinite(timestamp)
            ? new Date(timestamp).toISOString()
            : '[invalid-date]';
        } catch {
          return '[invalid-date]';
        }
      }
      if (current instanceof URL) {
        return sanitizeUrl(intrinsicUrlString(current), resolved);
      }
      if (current instanceof Map) {
        const entries: SerializableValue[] = [];
        const iterator = intrinsicMapEntries(current);
        for (const [key, item] of iterator) {
          if (entries.length >= resolved.maxArrayLength) break;
          const redactItem =
            typeof key === 'string' &&
            (DANGEROUS_KEYS.has(key) ||
              keyMatches(key, resolved.sensitiveKeys));
          entries.push([
            visit(key, depth + 1),
            redactItem ? resolved.redactValue : visit(item, depth + 1),
          ]);
        }
        return {
          type: 'Map',
          entries,
        };
      }
      if (current instanceof Set) {
        const values: SerializableValue[] = [];
        const iterator = intrinsicSetValues(current);
        for (const item of iterator) {
          if (values.length >= resolved.maxArrayLength) break;
          values.push(visit(item, depth + 1));
        }
        return {
          type: 'Set',
          values,
        };
      }
      if (Array.isArray(current)) {
        const result: SerializableValue[] = [];
        const length = Math.min(current.length, resolved.maxArrayLength);
        for (let index = 0; index < length; index += 1) {
          const descriptor = safeOwnDescriptor(current, String(index));
          result.push(
            descriptor && 'value' in descriptor
              ? visit(descriptor.value, depth + 1)
              : descriptor
                ? '[accessor]'
                : null,
          );
        }
        return result;
      }

      const keys = ownEnumerableKeys(current);
      if (keys === null) return '[unavailable]';
      const result: Record<string, SerializableValue> = {};
      for (const key of keys.slice(0, resolved.maxObjectKeys)) {
        if (
          DANGEROUS_KEYS.has(key) ||
          keyMatches(key, resolved.sensitiveKeys)
        ) {
          defineSafe(result, key, resolved.redactValue);
          continue;
        }
        const descriptor = safeOwnDescriptor(current, key);
        defineSafe(
          result,
          key,
          descriptor && 'value' in descriptor
            ? visit(descriptor.value, depth + 1)
            : '[accessor]',
        );
      }
      return result;
    } catch {
      return '[unavailable]';
    } finally {
      active.delete(current);
    }
  };

  return finalizeBudget(visit(value, 0), resolved);
}

function sanitizePrimitive(
  value: unknown,
  options: ResolvedSanitizeOptions,
): SerializableValue | undefined {
  if (typeof value === 'string') return sanitizeText(value, options);
  if (typeof value === 'boolean' || value === null) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function sanitizeMetadataValue(
  key: string,
  value: unknown,
  options: ResolvedSanitizeOptions,
): SerializableValue | undefined {
  if (key === 'filename') {
    return typeof value === 'string' ? sanitizeUrl(value, options) : undefined;
  }
  if (key === 'lineno' || key === 'colno') {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }
  if (key === 'unhandledRejection' || key === 'silent' || key === 'retryable') {
    return typeof value === 'boolean' ? value : undefined;
  }
  return sanitizePrimitive(value, options);
}

/** Apply the transport context allowlist and omit request bodies by default. @public */
export function sanitizeContext(
  context: unknown,
  options: SanitizeOptions = {},
): SerializableValue {
  const resolved = resolveOptions(options);
  if (context === null || typeof context !== 'object') return {};
  const result: Record<string, SerializableValue> = {};

  for (const key of ['url', 'route', 'component'] as const) {
    const value = ownDataValue(context, key);
    if (typeof value === 'string') {
      defineSafe(
        result,
        key,
        key === 'url' || key === 'route'
          ? sanitizeUrl(value, resolved)
          : sanitizeText(value, resolved),
      );
    }
  }

  const browser = ownDataValue(context, 'browser');
  if (browser !== null && typeof browser === 'object') {
    const sanitizedBrowser: Record<string, SerializableValue> = {};
    for (const key of ['userAgent', 'language'] as const) {
      const value = ownDataValue(browser, key);
      if (typeof value === 'string') {
        defineSafe(sanitizedBrowser, key, sanitizeText(value, resolved));
      }
    }
    const viewport = ownDataValue(browser, 'viewport');
    if (viewport !== null && typeof viewport === 'object') {
      const sanitizedViewport: Record<string, SerializableValue> = {};
      for (const key of ['width', 'height'] as const) {
        const value = ownDataValue(viewport, key);
        if (typeof value === 'number' && Number.isFinite(value)) {
          defineSafe(sanitizedViewport, key, value);
        }
      }
      if (Object.keys(sanitizedViewport).length > 0) {
        defineSafe(sanitizedBrowser, 'viewport', sanitizedViewport);
      }
    }
    if (Object.keys(sanitizedBrowser).length > 0) {
      defineSafe(result, 'browser', sanitizedBrowser);
    }
  }

  const request = ownDataValue(context, 'request');
  if (request !== null && typeof request === 'object') {
    const sanitizedRequest: Record<string, SerializableValue> = {};
    const method = ownDataValue(request, 'method');
    const url = ownDataValue(request, 'url');
    if (typeof method === 'string') {
      defineSafe(sanitizedRequest, 'method', sanitizeText(method, resolved));
    }
    if (typeof url === 'string') {
      defineSafe(sanitizedRequest, 'url', sanitizeUrl(url, resolved));
    }
    const headers = ownDataValue(request, 'headers');
    if (headers !== null && typeof headers === 'object') {
      const sanitizedHeaders: Record<string, SerializableValue> = {};
      for (const key of ownEnumerableKeys(headers) ?? []) {
        const lowerKey = key.toLowerCase();
        if (!resolved.allowedHeaderKeys.has(lowerKey)) continue;
        const header = ownDataValue(headers, key);
        const sanitizedHeader = sanitizePrimitive(header, resolved);
        if (sanitizedHeader !== undefined) {
          defineSafe(sanitizedHeaders, lowerKey, sanitizedHeader);
        }
      }
      if (Object.keys(sanitizedHeaders).length > 0) {
        defineSafe(sanitizedRequest, 'headers', sanitizedHeaders);
      }
    }
    if (Object.keys(sanitizedRequest).length > 0) {
      defineSafe(result, 'request', sanitizedRequest);
    }
  }

  const rawMetadata = ownDataValue(context, 'metadata');
  if (rawMetadata !== null && typeof rawMetadata === 'object') {
    const metadata: Record<string, SerializableValue> = {};
    for (const key of resolved.allowedMetadataKeys) {
      const sanitized = sanitizeMetadataValue(
        key,
        ownDataValue(rawMetadata, key),
        resolved,
      );
      if (sanitized !== undefined) defineSafe(metadata, key, sanitized);
    }
    if (Object.keys(metadata).length > 0) {
      defineSafe(result, 'metadata', metadata);
    }
  }
  return finalizeBudget(result, resolved);
}
