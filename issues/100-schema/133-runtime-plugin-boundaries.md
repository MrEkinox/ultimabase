# 133: Harden runtime plugin and index boundaries

- Status: done
- Milestone: 1
- Packages: schema, pg-vector-plugin
- Depends on: 131
- ADR: 0033

## Goal

Give JavaScript callers and community field packages precise errors at unknown
configuration boundaries.

## Acceptance criteria

- [x] Composite index containers, entries, fields, and flags are guarded.
- [x] Schema exports a reusable `assertFieldOptions` assertion.
- [x] The vector field guards options before reading dimensions.
- [x] Plugin scalar callbacks use the explicit `snapshotValue` contract.
- [x] Documentation defines purity, determinism, and idempotence requirements.
