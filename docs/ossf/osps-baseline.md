# OpenSSF baseline review

Review date: 2026-07-11

This prerelease source applies the OSPS baseline proportionately to a small
ESM-only TypeScript library.

Implemented controls:

- protected `main` with pull-request, CODEOWNERS, conversation-resolution,
  linear-history, no-force-push, and no-deletion rules;
- protected immutable `v*` tags;
- least-privilege, SHA-pinned GitHub Actions;
- Node 22 and 24 required CI with Node 26 informational CI;
- DCO sign-off, dependency review, Dependabot, CodeQL, Scorecard, secret
  scanning, push protection, and private vulnerability reporting;
- explicit package contents, API reports, coverage thresholds, source maps,
  clean-room verification, SHA-512 manifests, and build provenance.

Release-blocking controls are the package's exact named-consumer gate and
reviewed candidate release issue. npm trusted publishing and registry
provenance remain blocked until the organization owner configures npm access.
No exception permits publishing a registry version without those controls.
