# 2609: Enforce soft-delete tombstone visibility and writes

- Status: completed
- Milestone: 26
- Packages: `@ultimabase/soft-delete-plugin`, `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: 2603, 2608
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Contribute one protected tombstone field and monotonic default-visibility rule
for every enabled schema, independently from optional Access and Hooks engines.

## Acceptance criteria

- [x] Each enabled application-owned schema receives the fixed stored
      `isDeleted` boolean with required false default and exact plugin
      provenance; any developer or plugin field collision fails compilation.
- [x] Ordinary create, update, upsert, bulk, nested-write, REST, and GraphQL
      inputs cannot set or change the tombstone.
- [x] Default one, many, first, count, exists, include, pointer, relation, eager
      result, and mutation target reads exclude tombstoned rows through Core's
      protected monotonic constraint capability.
- [x] Developer predicates, business middleware, Hooks, persistence rewriters,
      and optional Access engines cannot inspect, remove, or broaden the private
      visibility predicate.
- [x] Ordinary Master reads retain default visibility; administrative commands
      use only their exact audited internal target path rather than a public
      include-deleted switch.
- [x] PostgreSQL compiles the field and every protected target predicate without
      introducing adapter-specific logic into the portable plugin package.
- [x] Disabled schemas retain their exact original graph, queries, inputs,
      storage, diagnostics, and Runtime cost.
- [x] Schema snapshots, synchronization and migration intent retain contribution
      ownership without silently dropping tombstone data when the plugin is
      removed.

## Tests

- [x] Core, PostgreSQL, relationship, nested-write, Access/no-Access, Master,
      two-application, Typegen, and no-Typegen matrices cover visibility and
      protected writes.
- [x] Tests prove raw filters and later middleware cannot resurrect a hidden
      target or mutate `isDeleted`.

## Out of scope

- Public include-deleted queries, custom tombstone names, timestamps, deleter
  identity, uniqueness reuse, partial indexes, and cascade behavior.

## Completion evidence

- Core and Plugin Kit expose an owner-attributed stored-field patch whose
  mutation input is forbidden while remaining selectable and persistable.
- The official plugin contributes the fixed `isDeleted` field only to exact
  enabled application schemas, and its protected policy adds an independent
  `isDeleted = false` row constraint to every ordinary non-create operation,
  including Master requests.
- PostgreSQL integration coverage proves visibility across direct reads,
  counts, existence checks, mutation targets, includes, pointers, relations,
  nested writes, Access composition, middleware rewrites, and transaction
  rollback.
- Direct synchronization no longer infers destructive column drops from an
  absent declaration. Removing a plugin therefore retains stored tombstone
  data until an explicit migration requests removal.
- Verified with focused Core, Plugin Kit, soft-delete, planner, packed
  JavaScript, and PostgreSQL suites, then `yarn constraints`,
  `yarn check:issues`, `yarn format:check`, `yarn typecheck`, `yarn test`,
  `yarn lint`, and `NODE_OPTIONS=--max-old-space-size=8192 yarn build`.
