# 333: Protect hook execution and expose diagnostics

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 330, 332
- ADR: ADR-0042, ADR-0062, ADR-0089, ADR-0106

## Goal

Prevent accidental recursive hook loops and expose safe cancellation, timing,
and failure diagnostics.

## Acceptance criteria

- [x] Runtime records an immutable hook execution stack across nested engine operations.
- [x] Dangerous same-hook recursion fails with a typed framework error and actionable hook, schema, field, and operation details.
- [x] No public or transport-derived `skipHooks` flag can bypass business invariants.
- [x] Hook inputs expose request and transaction identities plus an `AbortSignal` without exposing raw credentials.
- [x] Cancellation stops remaining pre-commit handlers and triggers rollback when a transaction is active.
- [x] Diagnostics expose hook identity, owner, phase, and duration through a safe observer contract.
- [x] Observability callbacks cannot alter ordering, results, or error identity.
- [x] Recursive operations targeting other hooks remain supported and retain the current transaction engine.

## Tests

- [x] Direct, indirect, bounded nested, and cross-schema recursion tests.
- [x] Cancellation, timeout, rollback, diagnostic redaction, and observer-failure tests.
- [x] Compile-time context tests exclude master keys and mutable execution state.

## Out of scope

- Arbitrary hook disabling.
- Numeric priorities or concurrent business hook execution.
