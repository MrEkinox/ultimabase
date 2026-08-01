# 333: Protect hook execution and expose diagnostics

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/runtime`, `@ultimabase/core`
- Depends on: 330, 332
- ADR: ADR-0042, ADR-0062, ADR-0089

## Goal

Prevent accidental recursive hook loops and expose safe cancellation, timing,
and failure diagnostics.

## Acceptance criteria

- [ ] Runtime records an immutable hook execution stack across nested engine operations.
- [ ] Dangerous same-hook recursion fails with a typed framework error and actionable hook, schema, field, and operation details.
- [ ] No public or transport-derived `skipHooks` flag can bypass business invariants.
- [ ] Hook inputs expose request and transaction identities plus an `AbortSignal` without exposing raw credentials.
- [ ] Cancellation stops remaining pre-commit handlers and triggers rollback when a transaction is active.
- [ ] Diagnostics expose hook identity, owner, phase, and duration through a safe observer contract.
- [ ] Observability callbacks cannot alter ordering, results, or error identity.
- [ ] Recursive operations targeting other hooks remain supported and retain the current transaction engine.

## Tests

- [ ] Direct, indirect, bounded nested, and cross-schema recursion tests.
- [ ] Cancellation, timeout, rollback, diagnostic redaction, and observer-failure tests.
- [ ] Compile-time context tests exclude master keys and mutable execution state.

## Out of scope

- Arbitrary hook disabling.
- Numeric priorities or concurrent business hook execution.
