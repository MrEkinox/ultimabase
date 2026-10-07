# ADR-0024: Separate integer and float fields

- Status: accepted
- Date: 2026-07-31

## Decision

Schema exposes `intField()` and `floatField()` as separate field factories and
removes `numberField({ mode })`. Their field kinds are respectively `int` and
`float`, so consumers discriminate numeric semantics without inspecting an
additional option.

`intField()` represents safe JavaScript integers. Its range boundaries must be
safe integers, and it exclusively owns `autoIncrement` metadata.

`floatField()` represents general JavaScript numbers without promising decimal
precision. Its range boundaries must be finite numbers, and
`validation.finite` controls whether persisted values must also be finite.

Both factories reuse one internal numeric-range normalizer while exposing
independent public option and validation-plan types. Exact decimals remain a
future field with a non-lossy value contract.

## Consequences

Declarations become shorter and invalid combinations such as float
auto-increment metadata are structurally unavailable. Validation plans and
field kinds no longer carry a redundant numeric `mode`.

This is a breaking pre-release API replacement. Retaining `numberField` as an
alias would preserve duplicate code paths and ambiguity, so no compatibility
alias is provided.
