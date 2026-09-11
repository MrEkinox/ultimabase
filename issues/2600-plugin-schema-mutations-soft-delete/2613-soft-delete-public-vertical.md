# 2613: Prove the public official soft-delete vertical

- Status: completed
- Milestone: 26
- Packages: all milestone 26 packages and public examples
- Depends on: 2612
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Prove both modes through one real public application from source declarations
to PostgreSQL, direct execution, REST, GraphQL, and Master administration.

## Acceptance criteria

- [x] A documented application enables replace mode on one schema, explicit
      mode on another, and leaves a third schema disabled through inheritance or
      direct override.
- [x] The example demonstrates direct schema/model commands, REST and GraphQL
      explicit soft delete, retained hard delete, default invisibility, and
      server-side restore and purge.
- [x] Official Access independently authorizes delete and `softDelete`; official
      Hooks and audit evidence distinguish delete, soft delete, restore, purge,
      physical update, and physical delete without duplicate lifecycle calls.
- [x] Source TypeScript, generated Typegen, Typegen-free JavaScript, built and
      packed package consumers all use only public root exports.
- [x] PostgreSQL synchronization, persistence plans, protected predicates,
      relations, counts, eager results, ordered delete batches, rollback, and
      application isolation match the portable contract.
- [x] REST and GraphQL expose only eligible schemas and operations, report safe
      errors, and never expose restore or purge.
- [x] The package README, root README, architecture, concepts, examples, and
      migration guidance explain the same developer contract and v1 exclusions.
- [x] No example uses a raw adapter, deep import, manual tombstone mutation,
      generated Runtime client, or transport-specific business handler.

## Tests

- [x] Focused public E2E suites cover anonymous, authenticated, Access-denied,
      Hook-failed, Master, restored, purged, cancelled, and cross-application
      requests through direct, REST, networkless GraphQL, and Yoga paths.
- [x] Packed-package and Typegen-free fixtures run against PostgreSQL without
      repository-internal imports.

## Out of scope

- Expanding the v1 feature set beyond the accepted ADR and earlier issues.

## Completion evidence

- The runnable `examples/minimal` application installs the official plugin with
  a disabled default, selects replace mode for `ExampleAuthor`, explicit mode
  for `ExampleArticle`, and leaves `ExamplePrivateNote` disabled. Its public
  helpers demonstrate authenticated schema and model commands plus audited
  Master restore and purge without generated Runtime code.
- The same application exposes only the explicit article mutation through REST
  and GraphQL. Focused PostgreSQL tests prove anonymous denial, Password Auth
  success, networkless GraphQL safe errors, Yoga execution, retained article
  hard delete, replace-mode author tombstones, default invisibility, restore,
  purge, and one durable transactional Hook event per logical effect.
- The complete soft-delete PostgreSQL matrix proves schema synchronization,
  protected reads and targets, counts, pointers, relations, eager results,
  ordered delete batches, rollback, cancellation, administration authority, and
  physical update/delete semantics. The authenticated public vertical adds a
  rejected foreign session and successful isolated second-application request.
- The vertical exposed and fixed two missing public-consumer invariants: the
  official payload-free mutations now register Core's
  `PluginSchemaMutationNoInput` Typegen reference, and schema-mutation target
  preparation translates default virtual selections into persisted dependency
  selections before entering PostgreSQL.
- A Typegen-free JavaScript fixture runs both modes, restore, purge, and disabled
  hard delete against PostgreSQL using only built package roots. Package archive
  and public export tests pass for every publishable package, including the
  official soft-delete package.
- Documentation now aligns the package, root overview, architecture, concepts,
  runnable example, and PostgreSQL migration guidance on mode inheritance,
  Access and Hooks identity, protected visibility, private administration, and
  every deliberate V1 exclusion.
- Verified with 23 focused soft-delete PostgreSQL tests, the five existing
  `minimal` PostgreSQL verticals, 93 packed/public-export tests,
  `yarn constraints`, `yarn check:issues`, `yarn format:check`, `yarn typecheck`,
  `yarn lint`, `NODE_OPTIONS=--max-old-space-size=8192 yarn build`, and the full
  `yarn test` gate: 2,324 tests across 494 files with no type errors. Lint
  reports only existing line-budget warnings.
