# Changelog

## 0.1.0-beta.3 - Unreleased

- Prepared the independently reviewed privacy-safe source for protected public
  `main` with SHA-pinned CI, public API governance, clean-source artifact
  manifests, and provenance workflow.
- Replaced the email detector with a linear scanner and adversarial long-input
  coverage after CodeQL rejected the previous backtracking expression.
- Redacts EAI/IDN addresses, the full ASCII `atext` set, quoted and obsolete
  mixed local parts, CFWS/nested comments, domain literals, IDNA dot forms,
  and single-label domains without leaking identifying prefixes or suffixes.
- Gives original-text mailbox ranges precedence over URL and secret matching,
  preserves URL-shaped custom redaction markers through opaque sentinels, and
  fails closed against a shared email scan-work budget to keep scanning linear.
- Supersedes the dirty-tree beta.2 implementation artifact; beta.2 remains
  historical local evidence and must not be uploaded or retagged.

## 0.1.0-beta.2 - 2026-07-11

- Superseded beta.1 after independent review found URL text-scanning privacy
  bypasses; beta.1 must not be promoted or installed by consumers.
- Added bounded, fail-closed inspection for fully and repeatedly
  percent-encoded URLs, embedded URLs in paths/queries/fragments, malformed
  encodings, and mixed encoded/literal URL text.
- Hardened credential and URL recognition for slashless special schemes,
  protocol-relative backslashes, raw whitespace and punctuation, URL wrapper
  characters, multiple URLs, and collision-resistant marker restoration.
- Made raw-whitespace URL ambiguity explicit: uncertain query/fragment
  continuations redact the whole text value, while bounded wrappers,
  immediate independent URLs, email prose, and Unicode/symbol slash prose
  retain their intended structure.
- Bounded ambiguous-URL scanning to prevent quadratic runtime and added
  single- and pairwise-whitespace differential corpora, long-window
  regressions, printable-ASCII credential probes, and wrapper/order tests.
- Made generated API-document comparison portable across LF/CRLF and trailing
  generator whitespace without weakening semantic document equality.

## 0.1.0-beta.1 - 2026-07-10

- Froze publication after the 0.2 audit invalidated the earlier readiness
  assessment.
- Added allowlist-based, exception-safe, bounded sanitization for text, URLs,
  context, hostile objects, built-ins, cycles, shared references, and payload
  budgets, with 100% sanitizer branch coverage and randomized canary checks.
- Added detached deep-frozen error, cause, aggregate, browser-event, and
  rejection normalization with opaque fingerprints calculated after
  sanitization.
- Added exact-TTL/capacity dedupe, bounded memory/noop reporters, and a cohesive
  ignore/dedupe/fixed-window-rate/backpressure/reporter-failure pipeline with
  typed normalization and pipeline failure results.
- Made oversized pre-inspection fail closed, applied sensitive-key redaction to
  Map entries, and restricted browser event reads to exact trusted WebIDL
  prototype getters.
- Added strict lint, formatting, TypeScript, coverage, generated API, package
  lint, clean-room, and immutable artifact tooling.
- Made `invest-runtime` the first real consumer through a body-free
  transport-safe analytics adapter.

## 0.0.0

- Added prepare-next public core scaffolding for framework-free client error
  normalization, sanitization, reporter contracts, and dedupe helpers.
- Expanded tests for circular metadata, depth truncation, sensitive query
  redaction, and dedupe TTL expiry.
