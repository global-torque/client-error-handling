# RFC 0001: Public 0.2 contract

- Status: Proposed
- Target: `0.1.0-beta.3`
- Last updated: 2026-07-11

## External problem

Browser and TypeScript hosts need bounded transport-safe error normalization, privacy sanitization, fingerprints, dedupe, reporters, and backpressure without adopting a telemetry sink.

## Public surface

The supported imports are `.`, `./dedupe`, `./normalize`, `./pipeline`, `./reporter`, `./sanitize`, and `./types`. Exports are ESM-only ES2022 with
declarations and Node.js 22 or newer. Undeclared deep imports are private.

## Non-goals

Analytics/Loki adapters, Vue or router bootstrap, UI presenters, app config, raw diagnostics, Ory, session, and investment policy remain outside this package.

## Compatibility and release evidence

The private invest-runtime adapter must preserve behavior against the exact candidate, and a staging smoke must prove the outbound sink payload contains no raw canary data.

The candidate is built and packed once from a clean protected source commit.
The npm-format tarball, SHA-512 digest, per-file manifest, source commit, and
GitHub attestation remain immutable. A failed candidate receives a new beta
version; no tag or asset is replaced.

## Decision

Accept this contract only after the source pull request, API report, package
tests, clean rooms, and named-consumer evidence have no unresolved actionable
findings.
