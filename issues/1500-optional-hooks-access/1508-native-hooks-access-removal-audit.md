# 1508: Remove superseded native Hooks and Access surfaces

- Status: completed
- Milestone: 15
- Packages: repository-wide
- Depends on: 1507
- ADR: ADR-0189, ADR-0194, ADR-0202, ADR-0204, ADR-0205

## Goal

Delete every superseded Core-native Hooks and Access product implementation,
export, generated assumption, example, and compatibility path after the official
and alternative plugins prove the public replacements.

## Acceptance criteria

- [x] Core schema options, field options, plans, dispatchers, target registries, product errors, utilities, and barrels no longer expose Hooks or Access product vocabulary.
- [x] Generic middleware, transaction, cancellation, protected constraint, context, master, persistence, and event primitives remain focused and product-neutral.
- [x] Typegen generates Hooks and Access contracts only from installed contributors and has no unconditional aliases or engine imports.
- [x] Every Core, package, example, documentation, issue, and test reference is classified as migrated, historical, intentionally generic, or removed.
- [x] No compatibility alias, hidden native dispatcher, neutral no-op engine, deep import, or private official-plugin bridge remains.
- [x] Package READMEs show explicit official plugin installation and no-engine JavaScript usage.
- [x] Each official vertical package exposes its public contracts without import side effects or a separate contract-only package; independent engines own their protocols.

## Tests

- [x] Source and packed negative tests prove removed names cannot be imported from Core and official packages work only through public contracts.
- [x] Repository and generated-output searches protect the removal audit against stale executable or documented paths.

## Reference classification

- Migrated: active Core source, public package documentation, schema examples,
  Typegen tests, and PostgreSQL suites now point to generic Core mechanisms or
  the owning official package.
- Intentionally generic: `RequestAccess`, anonymous/master request authority,
  plugin lifecycle hooks, low-level Runtime contributions, cancellation,
  protected constraints, and post-commit observers remain Core concepts.
- Historical: accepted and superseded ADRs, completed plans, and completed
  issues retain the terminology that records the architecture they delivered.
- Removed: Core-native schema/field declarations, plans, dispatchers, target
  registries, contexts, named events, diagnostics, compatibility examples, and
  their private module paths.

## Completion evidence

- `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn lint`,
  `yarn format:check`, and `yarn build` pass.
- Built E2E, PostgreSQL Testcontainers, package archive, source language-service,
  and packed language-service suites pass.
- The removal guard checks obsolete Core directories, source and packed export
  names, and public-only imports from both official vertical packages.

## Out of scope

- Rewriting historical accepted or superseded ADR text to hide prior architecture.
- Changing official Hooks or Access semantics beyond the accepted migration.
