# 2609: Enforce soft-delete tombstone visibility and writes

- Status: planned
- Milestone: 26
- Packages: `@ultimabase/soft-delete-plugin`, `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: 2603, 2608
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Contribute one protected tombstone field and monotonic default-visibility rule
for every enabled schema, independently from optional Access and Hooks engines.

## Acceptance criteria

- [ ] Each enabled application-owned schema receives the fixed stored
      `isDeleted` boolean with required false default and exact plugin
      provenance; any developer or plugin field collision fails compilation.
- [ ] Ordinary create, update, upsert, bulk, nested-write, REST, and GraphQL
      inputs cannot set or change the tombstone.
- [ ] Default one, many, first, count, exists, include, pointer, relation, eager
      result, and mutation target reads exclude tombstoned rows through Core's
      protected monotonic constraint capability.
- [ ] Developer predicates, business middleware, Hooks, persistence rewriters,
      and optional Access engines cannot inspect, remove, or broaden the private
      visibility predicate.
- [ ] Ordinary Master reads retain default visibility; administrative commands
      use only their exact audited internal target path rather than a public
      include-deleted switch.
- [ ] PostgreSQL compiles the field and every protected target predicate without
      introducing adapter-specific logic into the portable plugin package.
- [ ] Disabled schemas retain their exact original graph, queries, inputs,
      storage, diagnostics, and Runtime cost.
- [ ] Schema snapshots, synchronization and migration intent retain contribution
      ownership without silently dropping tombstone data when the plugin is
      removed.

## Tests

- [ ] Core, PostgreSQL, relationship, nested-write, Access/no-Access, Master,
      two-application, Typegen, and no-Typegen matrices cover visibility and
      protected writes.
- [ ] Tests prove raw filters and later middleware cannot resurrect a hidden
      target or mutate `isDeleted`.

## Out of scope

- Public include-deleted queries, custom tombstone names, timestamps, deleter
  identity, uniqueness reuse, partial indexes, and cascade behavior.
