# 812: Remove redundant generated Access and hook aliases

- Status: completed
- Milestone: 8
- Packages: `@ultimabase/typegen`
- Depends on: 807
- ADR: [ADR-0185](../../docs/adr/0185-canonical-generated-schema-aliases.md)

## Goal

Keep the application-facing generated declaration focused on canonical schema
value and operation-input aliases instead of emitting redundant `*Access` and
`*Hooks` wrapper types that Core does not consume.

## Acceptance criteria

- [x] Typegen no longer emits per-schema `*Access` or `*Hooks` aliases.
- [x] Exact Access and hook callback inference continues to come from the
      generated `Schemas.<Name>` registry through Core's public declarations.
- [x] Canonical `*Item`, `*CreateInput`, `*UpdateInput`, `*WhereInput`,
      `*OrderByInput`, `*Select`, and `*Include` aliases remain unchanged.
- [x] The generator fingerprint changes so stale artifacts cannot retain the
      removed declaration surface.
- [x] The committed Todo declaration is freshly regenerated.
- [x] Public documentation describes contextual Access and hook inference
      without promising standalone wrapper aliases.

## Tests

- [x] Generator tests reject both redundant alias families.
- [x] Source and packed-package language-service tests retain exact Access and
      hook completions and hover types.
- [x] Typecheck, tests, lint, formatting, constraints, build, and packed
      declaration verification pass.

## Evidence

Typegen now emits only the canonical per-schema value and operation-input
aliases. Generator version 9 produces a new Todo fingerprint, and packed-package
generation matches the committed Todo declaration byte for byte.

The focused Typegen suite passes 7 files and 21 tests. Packed-package
verification passes 7 files and 50 tests. Repository validation passes 290
files and 1,819 tests with no type errors, plus typecheck, lint, formatting,
constraints, build, package publication checks, and the Todo application
typecheck.

## Out of scope

- Changing Access or hook runtime behavior, declaration syntax, or lifecycle.
- Removing canonical schema value and operation-input aliases.
- Resuming the broader issue 810 DX and performance audit.
