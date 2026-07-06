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

## Support

Use GitHub issues on `global-torque/client-error-handling` for normalization,
redaction, reporter contract, and dedupe behavior requests. Framework adapters,
analytics transports, and product-specific telemetry wiring belong in the host
repository until they are proven generic.

## Security

Report suspected vulnerabilities through the repository security policy in
`SECURITY.md`. Do not include raw customer data, request payloads, tokens,
cookies, authorization headers, private URLs, or stack traces that expose
secrets in public issues.

## Changelog And Versioning

Release notes live in `CHANGELOG.md`. The package stays in `0.x` while the
normalization schema, sanitizer defaults, reporter interfaces, and dedupe
behavior are stabilized. Breaking schema or redaction changes may ship as minor
`0.x` releases before a stable `1.0` contract.

## Ownership And Feedback

Global Torque owns the framework-free error core. Host apps own transport,
sampling, UI messaging, session/profile context, and backend observability
adapters. Feedback should separate reusable core behavior from private host
integration requirements.
