# 4402: Remove schema-mutation Runtime casts

- Status: planned
- Milestone: 44
- Packages: `@ultimabase/core`, `@ultimabase/access-plugin`, `@ultimabase/hooks-plugin`
- Depends on: 4401
- ADR: ADR-0245, ADR-0259, ADR-0272

## Goal

Adopt the truthful logical-operation contracts in the schema-mutation pipeline
and official engines, removing forced casts and duplicate stage envelopes.

## Acceptance criteria

- [ ] Schema-mutation Runtime dispatch uses typed stage inputs and results.
- [ ] Official Access and Hooks narrow logical operations without bridge casts.
- [ ] Exact schema-mutation identity, target, outcome, and result behavior remain unchanged.
- [ ] Focused Runtime and compile-time regressions pass.
- [ ] Documentation impact is recorded.

## Out of scope

- Redesigning Access or Hooks authoring contracts.
- Reordering or merging the schema-mutation pipeline.
- Removing unrelated assertions required at untrusted adapter boundaries.
