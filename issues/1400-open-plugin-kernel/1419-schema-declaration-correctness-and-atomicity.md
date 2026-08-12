# 1419: Harden schema declaration correctness and atomicity

- Status: planned
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1406
- ADR: ADR-0187, ADR-0190, ADR-0191, ADR-0192

## Goal

Correct the post-1406 audit findings so plugin schema declarations remain
usage-driven, exact-instance-bound, structurally deterministic, and atomic on
failure before the open kernel adds another compiler layer.

## Accepted remediation scope

- Installed option descriptors do not conflict merely because they share a
  direct property name. Core resolves ownership only for an option occurrence
  that is present in the final candidate graph; zero occurrences have no effect.
- A plugin contribution identity is local to the complete structured owner
  `{ pluginId, instanceId? }`. Two explicit instances may therefore reuse the
  same local `contributionId` without losing exact provenance.
- Schema registration and compilation publish one complete graph or no plugin
  additions. A failure never leaves a partially registered public schema graph.
- Failed compilation permanently closes that application instance, prevents
  initialization and start, and reports one stable `PLUGIN_DECLARATION_INVALID`
  error with safe owner, contribution, and path diagnostics while retaining the
  original cause.
- JSON option selectors use structural JSON equality. Object property insertion
  order never changes whether a selector matches.

## Acceptance criteria

- [ ] Two plugins declaring the same unused schema or field option compile without conflict and execute no validator or Runtime compiler.
- [ ] A used option still requires one exact owner; missing and genuinely ambiguous used owners fail deterministically without last-writer-wins behavior.
- [ ] Two explicit instances of one plugin may reuse one local schema `contributionId`, and final provenance retains the exact instance for each schema.
- [ ] Duplicate contribution IDs for the same exact owner still fail before any schema addition is published.
- [ ] Registration collisions, option failures, selector failures, patch failures, and final schema validation failures expose no partial plugin schema graph.
- [ ] A failed application cannot compile, initialize, or start again and reports `PLUGIN_DECLARATION_INVALID` with the original failure as its cause.
- [ ] Selector equality treats JSON object keys as unordered while preserving array order and exact primitive semantics.
- [ ] No compiler replacement, Typegen rendering, dynamic handle, adapter, or migration behavior is introduced.

## Tests

- [ ] Runtime regressions cover unused duplicate descriptors, used ambiguity, two explicit instances, same-owner duplicates, every atomic failure boundary, terminal application state, and reordered JSON object keys.
- [ ] Type and public-export tests cover the stable declaration diagnostic without widening plugin option types before issue 1408.

## Out of scope

- Capability requirement phase and serializable declaration-value typing; issue 1420 owns them.
- Splitting the schema declaration implementation or enforcing repository file-size budgets; issue 1421 owns that mechanical follow-up.
- Complete schema-compiler replacement; issue 1418 remains the only owner of that protocol.
