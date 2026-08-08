# 137: Consolidate Schema construction primitives

- Status: done
- Milestone: 1
- Packages: shared, schema
- Depends on: 136
- ADR: ADR-0037

## Goal

Remove repeated scalar factory, ordered range, and untrusted runtime guard logic
without changing Schema's public field behavior or inference.

## Acceptance criteria

- [x] Generic runtime guards live in Shared and narrow unknown values precisely.
- [x] Compatible scalar fields reuse one typed construction factory.
- [x] Numeric, length, temporal, and decimal ranges reuse one ordered normalizer.
- [x] Specialized field validation and snapshot ownership remain local.
- [x] No `any` or third-party runtime dependency is introduced.
- [x] Shared and Schema documentation describe the consolidated boundaries.
- [x] Typecheck, tests, lint, build, package validation, and coverage pass.

## Tests

- [x] Shared guards have colocated runtime coverage.
- [x] Existing field runtime and compile-time tests pass through the common factory.
- [x] Ordered range tests cover valid, malformed, invalid, and reversed metadata.
- [x] Built archives expose Shared guards and preserve Schema's public API.

## Out of scope

- Replacing Schema validation plans with a third-party validation language.
- Changing time or date representations.
