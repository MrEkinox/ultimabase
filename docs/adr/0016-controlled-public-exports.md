# ADR-0016: Controlled public exports

- Status: accepted
- Date: 2026-07-30

## Decision

Every package exposes deliberate root entry points through `exports`. Deep source imports are unsupported and must be tested.

Use tsdown, declaration output, publint, Are The Types Wrong, package archives, and API reports before publication.

## Consequences

Internal refactors remain possible without accidentally expanding the public contract.
