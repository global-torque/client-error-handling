# @global-torque/client-error-handling

> **Public 0.1 beta candidate:** the source is under review. Do not install a
> mutable branch or reuse the earlier dirty-tree beta.2 artifact. Promotion
> requires the protected-tag beta.3 asset and the private runtime/staging gate.

Framework-free, transport-safe client error normalization, sanitization,
dedupe, reporters, and bounded reporting orchestration.

## Installation and compatibility

Approved consumers install the reviewed immutable GitHub beta asset. No npm
registry version exists yet; after registry promotion the equivalent command is:

```sh
pnpm add @global-torque/client-error-handling@0.1.0-beta.N
```

| Contract         | Supported                         |
| ---------------- | --------------------------------- |
| Runtime          | ESM-only, ES2022                  |
| Node.js          | 22.x and 24.x; 26.x informational |
| Browsers         | Modern browsers with ES2022       |
| Frameworks       | None                              |
| Package managers | npm and pnpm clean-room installs  |

## Threat model and guarantees

`NormalizedClientError` is the only value accepted by a
`ClientErrorReporter`. It is a detached, deeply frozen, JSON-compatible
transport record. Reporters never receive the original thrown value.

The default allowlist:

- bounds names, messages, stack frames, causes, aggregate errors, arrays,
  object keys, depth, node count, string length, and total serialized bytes;
- redacts authorization schemes, secret assignments, JWT-like values, email
  addresses, and long digit sequences;
- strips URL credentials, queries, and fragments by default;
- detects whole URLs and sensitive text through bounded percent-decoding, and
  fails closed for malformed or over-budget encoded tokens;
- redacts an entire text value when raw whitespace makes a URL query or
  fragment boundary ambiguous instead of inventing a path from trailing prose;
- omits request bodies, payloads, cookies, authorization headers, and unknown
  context fields;
- distinguishes circular from shared references and neutralizes dangerous
  prototype keys;
- handles accessors, proxies, sparse arrays, `Date`, `URL`, `Map`, `Set`,
  `BigInt`, and non-finite numbers without executing input accessors.
- fails closed with an opaque truncation marker when bounded pre-inspection
  cannot safely examine a complete text or URL value.

No generic sanitizer can identify every application secret from value alone.
Hosts must pass known canaries through `redactValues`, keep metadata/header
allowlists narrow, and retain raw diagnostics only in host-local tooling.

## Cohesive pipeline

```ts
import {
  createClientErrorPipeline,
  createMemoryErrorReporter,
} from '@global-torque/client-error-handling';

const memory = createMemoryErrorReporter({ maxEntries: 20 });
const errors = createClientErrorPipeline({
  reporters: [memory],
  dedupe: { ttlMs: 30_000, maxEntries: 250 },
  rateLimit: { maxReports: 20, intervalMs: 60_000 },
  maxQueueSize: 50,
  ignore: (error) =>
    error instanceof DOMException && error.name === 'AbortError',
});

const result = await errors.report(new Error('Request failed'), {
  route: '/settings?token=private',
  request: {
    method: 'GET',
    url: 'https://user:pass@example.test/api?token=private#debug',
  },
});

if (result.status === 'reporter-failed') {
  // Host-owned fallback; the result contains only the safe normalized record.
}
```

Pipeline results also distinguish `normalization-failed` and `pipeline-failed`,
so injected clock or policy failures cannot reject with a raw diagnostic.
`flush()` waits for accepted in-flight reports; `clear()` resets dedupe and the
fixed rate window without cancelling reporters. Complete reporter failure
forgets the dedupe entry so a later retry is not poisoned.

## Sanitizer policy

```ts
import { normalizeClientError } from '@global-torque/client-error-handling/normalize';

const safe = normalizeClientError(
  new Error('token=KNOWN_CANARY'),
  {
    metadata: {
      operation: 'load-profile',
      payload: { password: 'must never leave the host' },
    },
  },
  {
    sanitize: {
      redactValues: ['KNOWN_CANARY'],
      allowedMetadataKeys: ['operation'],
      maxTotalBytes: 8_192,
    },
  },
);
```

`allowUrlQuery` and `allowUrlFragment` are explicit opt-ins. Even with query
retention enabled, configured sensitive query keys are redacted. Request body
retention is intentionally not an option.

## Exports

- `@global-torque/client-error-handling`
- `@global-torque/client-error-handling/dedupe`
- `@global-torque/client-error-handling/normalize`
- `@global-torque/client-error-handling/pipeline`
- `@global-torque/client-error-handling/reporter`
- `@global-torque/client-error-handling/sanitize`
- `@global-torque/client-error-handling/types`

Generated API documentation begins at
[`docs/api/client-error-handling.md`](docs/api/client-error-handling.md), with
the committed API contract in `etc/client-error-handling.api.md`.

## First consumer and ownership

The Global Torque Client Reliability maintainers own the sanitizer, normalized
transport contract, pipeline semantics, compatibility matrix, and release
decision. The named private runtime pilot is the first real consumer. Its
adapter converts legacy error summaries into this package's body-free transport
contract before analytics dedupe and dispatch. Product sinks, routes, UI
presentation, Ory handling, environment flags, and telemetry schema remain
private host responsibilities.

This package does not own Vue, Pinia, VitePress, browser listeners, network
clients, backend sinks, user notifications, or application ignore policy.

Contributions start with a package-repository issue. Pull requests must include
hostile-input regression tests, preserve sanitizer 100% branch coverage, update
the API report/reference and changelog for public changes, and pass the complete
verification command list below. A maintainer must review both the transport
threat model and exact packed artifact before a beta is accepted.

## Breaking migration

Earlier prepare-next scaffolding exposed separate normalization and fake
reporter helpers but did not guarantee transport safety. For 0.1:

- reporters accept only `NormalizedClientError`, never `unknown`;
- hosts call `normalizeClientError()` or `createClientErrorPipeline()` before
  dispatch;
- context is allowlisted and bodies/payloads are dropped;
- fingerprints are opaque and calculated only from sanitized diagnostics;
- dedupe options reject zero, negative, non-integer, and non-finite bounds.

## Rollback

Pin the last known-good tarball SHA-512 (or exact npm version), reinstall it in
every named consumer, and rerun the same clean-room and consumer matrix. Never
retag or replace a failed artifact. Deprecate a bad registry version and
publish a new version from a reviewed tarball.

## Clean-room verification

This packed example is executed in both npm and pnpm consumers:

```js clean-room
import assert from 'node:assert/strict';
import {
  createClientErrorPipeline,
  createMemoryErrorReporter,
} from '@global-torque/client-error-handling';

const reporter = createMemoryErrorReporter({ maxEntries: 1 });
const pipeline = createClientErrorPipeline({
  reporters: [reporter],
  dedupe: false,
  rateLimit: false,
});
const result = await pipeline.report(
  new Error('token=CANARY user@example.test 123456789012'),
  { request: { url: 'https://user:pass@example.test/a?token=CANARY' } },
);
const serialized = JSON.stringify(result);
assert.equal(result.status, 'reported');
assert.equal(serialized.includes('CANARY'), false);
assert.equal(serialized.includes('user@example.test'), false);
assert.equal(serialized.includes('123456789012'), false);
assert.equal(reporter.reports.length, 1);
```

Run `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`,
`pnpm run test:coverage`, `pnpm run build`, `pnpm run docs:api`,
`pnpm run docs:check`, and `pnpm run package:lint` in this package. Security
reports use GitHub private vulnerability reporting. Feature requests and
reproducible bugs belong in
<https://github.com/global-torque/client-error-handling/issues>.
