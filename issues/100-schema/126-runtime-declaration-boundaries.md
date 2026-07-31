# 126: Harden runtime schema declarations

- Status: completed
- Milestone: 1
- Packages: schema
- Depends on: 125
- ADR: 0030

## Goal

Make public schema factories enforce their typed contracts for untyped
JavaScript callers before immutable metadata is registered.

## Acceptance criteria

- [x] Common option containers, booleans, indexes, descriptions, and extensions are validated.
- [x] Primitive static defaults and built-in-specific flags are validated by their field factories.
- [x] Schema and object field trees reject malformed, unnamed, unnamespaced, or circular definitions.
- [x] Plugin normalizer contracts are validated before use.
- [x] Runtime regression tests cover every declaration boundary.
