# @global-torque/client-error-handling

Prepare-next framework-free client error handling core.

This package is reserved for the public `@global-torque/client-error-handling`
surface. It is not a publication approval by itself: public release remains
blocked until private host adapters, staging telemetry evidence, clean
consumer checks, and release gates pass.

## What It Owns

- Error normalization for `Error`, non-Error throws, browser error events, and
  unhandled rejections.
- Privacy-safe context sanitization and redaction.
- Reporter interfaces and memory/noop test fakes.
- Dedupe helpers.

## What It Does Not Own

- Analytics-api, Loki, Grafana, or backend sink adapters.
- Vue, VitePress, Pinia, Vue Router, app bootstrap, session/profile route
  context, Ory/Kratos, Tahoe/fund-manager, investment workflow, or UI presenter
  behavior.
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

Prepare-next. Do not publish to npm until the OpenSpec release gates for the
error package track are complete.
