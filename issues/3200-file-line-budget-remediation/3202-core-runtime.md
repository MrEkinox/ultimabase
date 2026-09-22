# 3202: Split oversized Core Runtime modules

- Status: planned
- Milestone: 32
- Packages: `@ultimabase/core`
- Depends on: 3201
- ADR: ADR-0259

## Goal

Split oversized Runtime validation, boundaries, engine and inclusion modules
without changing pipeline order or security semantics.

## Acceptance criteria

- [ ] Every touched handwritten production file fits the 600-line hard limit.
- [ ] Runtime stages, validation, protected constraints and transaction semantics stay unchanged.
- [ ] Baseline entries for files brought under the limit are removed.

## Tests

- [ ] Relevant runtime, type and database tests pass.
- [ ] Audit confirms no pipeline or API change.

## Out of scope

- New Runtime extension points or behavior changes.
