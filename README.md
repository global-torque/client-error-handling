# @global-torque/client-error-handling

> [!CAUTION]
> This default-branch source is a quarantined pre-0.2 bridge, not an approved
> release candidate. Do not install it from GitHub, a branch, or npm. Use only
> a future immutable prerelease asset after its checksum, consumer evidence,
> and public release review are complete.

Prepare-next framework-free client error handling core.

This package is reserved for the public `@global-torque/client-error-handling`
surface. It is not a publication approval by itself: public release remains
blocked until host adapters, staging telemetry evidence, clean
consumer checks, and release gates pass.

## What It Owns

- Error normalization for `Error`, non-Error throws, browser error events, and
  unhandled rejections.
- Privacy-safe context sanitization and redaction.
- Reporter interfaces and memory/noop test fakes.
- Dedupe helpers.

## What It Does Not Own

- Host-specific analytics, logging, monitoring, or backend sink adapters.
- Framework bootstrap, identity, administration, regulated-workflow, session,
  routing, or UI-presentation behavior.
- Direct env reads, private URLs, raw request bodies, mutation payloads, secrets,
  or customer data.

## Usage

```ts
import {
  createMemoryErrorReporter,
  normalizeClientError,
} from '@global-torque/client-error-handling';

const reporter = createMemoryErrorReporter();
const error = normalizeClientError(new Error('Example'), {
  request: {
    url: 'https://api.example.test/items?token=secret',
    headers: { authorization: 'Bearer secret' },
  },
});

reporter.report(error);
```

Hosts provide transport, presentation, framework lifecycle, and telemetry
adapters through the `ClientErrorReporter` contract.

## Exports

- `@global-torque/client-error-handling`
- `@global-torque/client-error-handling/dedupe`
- `@global-torque/client-error-handling/normalize`
- `@global-torque/client-error-handling/reporter`
- `@global-torque/client-error-handling/sanitize`
- `@global-torque/client-error-handling/types`

## Release Status

Prepare-next. Do not publish to npm until the public release gates for the error
package track are complete.
