# 1508: Remove superseded native Hooks and Access surfaces

- Status: planned
- Milestone: 15
- Packages: repository-wide
- Depends on: 1507
- ADR: ADR-0189, ADR-0194

## Goal

Delete every superseded Core-native Hooks and Access product implementation,
export, generated assumption, example, and compatibility path after the official
and alternative plugins prove the public replacements.

## Acceptance criteria

- [ ] Core schema options, field options, plans, dispatchers, target registries, product errors, utilities, and barrels no longer expose Hooks or Access product vocabulary.
- [ ] Generic middleware, transaction, cancellation, protected constraint, context, master, persistence, and event primitives remain focused and product-neutral.
- [ ] Typegen generates Hooks and Access contracts only from installed contributors and has no unconditional aliases or engine imports.
- [ ] Every Core, package, example, documentation, issue, and test reference is classified as migrated, historical, intentionally generic, or removed.
- [ ] No compatibility alias, hidden native dispatcher, neutral no-op engine, deep import, or private official-plugin bridge remains.
- [ ] Package READMEs show explicit official plugin installation and no-engine JavaScript usage.
- [ ] Contract-only packages expose tokens and types without setup, Runtime implementation, automatic registration, or Core imports.

## Tests

- [ ] Source and packed negative tests prove removed names cannot be imported from Core and official packages work only through public contracts.
- [ ] Repository and generated-output searches protect the removal audit against stale executable or documented paths.

## Out of scope

- Rewriting historical accepted or superseded ADR text to hide prior architecture.
- Changing official Hooks or Access semantics beyond the accepted migration.
