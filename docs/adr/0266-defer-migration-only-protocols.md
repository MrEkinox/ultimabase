# ADR-0266: Defer migration-only protocols until a migration product exists

- Status: accepted
- Date: 2026-09-21
- Decision issue: 3107 (archived at tag `reference-archive`: `issues/3100-residual-complexity-simplification/3107-decide-unused-public-protocols.md`), RC-06
- Implementation: 3110 (archived at tag `reference-archive`: `issues/3100-residual-complexity-simplification/3110-remove-unused-migration-anticipation.md`)
- Partially supersedes: ADR-0191's migration privilege, ADR-0192/ADR-0193's implemented upgrade-planning contracts and ADR-0008's preinstalled preparation-claim assumption
- Reopens: only migration support in P-016 and C-023/C-026 of the milestone 30 matrix (archived at tag `reference-archive`: `docs/plans/2026-09-20-architecture-contract-matrix.md`)
- Approval: user explicitly accepted all three separately presented RC-04/RC-05/RC-06 removals on 2026-09-21, including the engineering-consumer exceptions

## Evidence and current behavior

No PostgreSQL migrations package is shipped. PostgreSQL currently advertises
neutral migration support, collects inert upgrade contributions, and skips its
direct schema preparation when a nominal preparation marker is present.
Migration/preparation providers exist in fixtures only. Core's planner compares
physical snapshots and classifies additions, stable entries, upgrades and
orphans; it validates explicit upgrade intent but never executes SQL.

This planner has a real public engineering consumer:
`planAdapterMigrations` → `FakeAdapterMigrationHistory.plan()` → the final
`open-kernel-proof.e2e.test.ts` case. That case verifies two instances, a
versioned upgrade and orphan metadata, using initialized applications without
connecting to PostgreSQL. It does not prove an applied migration or preserved
rows in a database. Its removal is the specific engineering exception accepted here.

Sources: former Core planner `packages/core/src/runtime/adapters/migration.ts`
and testing helper `packages/testing/src/adapters/fake-migration-history.ts`
at commit `21094201`,
[proof](../../tests/e2e/open-kernel-proof.e2e.test.ts),
PostgreSQL bridge (`packages/postgres-plugin/src/adapter-capabilities.ts`, removed by ADR-0289),
[startup](../../packages/postgres-plugin/src/plugin/postgres-plugin.ts).

## Exact deletion boundary

| Surface                             | Remove                                                                                                                                                                                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core runtime exports                | `adapterMigrationCapability`, `AdapterMigrationSupport`, `adapterUpgradeIntent`, `planAdapterMigrations`, `AdapterMigrationPlan`, `AdapterUpgradeIntentPayload`, `AdapterUpgradeTarget`, `OrphanedAdapterContribution`, `PlannedAdapterUpgrade`.                                   |
| Core unions and privilege reporting | `migration` from `AdapterCapabilityFamily` and `AdapterContributionFamily`; the associated private support variant; `migration:contribute` from `PluginPrivilege` and `pluginPrivilegeMetadata`; its exclusive `migration` member in `PluginPrivilegeFacade`.                      |
| Core implementation                 | Exclusive intent validation, transition comparison/planning, migration-family contribution validation and privilege dispatch; private `equalJsonValues` in `runtime/adapters/json-equality.ts`, whose only production consumer is this planner. Generic bridge validation remains. |
| PostgreSQL exports                  | `postgresMigrationContributionCapability`, `postgresUpgrade`, `postgresSchemaPreparationCapability`, `PostgresSchemaPreparationCapability`.                                                                                                                                        |
| PostgreSQL public metadata          | Only `PostgresAdapterMetadata.migrations`, also visible at `PostgresPluginExports.adapterMetadata.migrations`.                                                                                                                                                                     |
| PostgreSQL implementation/types     | Migration support provider and its `PostgresPlugin` tuple entry; migration/preparation optional requirements and tuple entries; collection of migration metadata; the marker-controlled skip of direct preparation.                                                                |
| Testing API                         | `FakeAdapterMigrationHistory`, its constructor, `snapshots`, `plan`, `accept`, barrel, dedicated runtime/type tests and README examples.                                                                                                                                           |
| Exclusive fixtures                  | Upgrade intent/options and marker providers; migration-plan assertions in the open-kernel proof and dedicated planner/marker tests. Retained storage, attribution and generic privilege assertions must survive.                                                                   |

No other snapshot field is approved for deletion. Keep **all** fields of
`AdapterContributionDefinition` and physical `AdapterContributionSnapshot`:
`normalizedStaticOptions`, `payload`, `protocolVersion`, `adapterId`,
`contributionId`, `family` (now physical only), optional `instanceId`,
`packageVersion`, `pluginId`. Keep the factories/tokens that create and attribute
physical contributions. Do not delete logical schema provenance, plugin-field
storage codec versions, private collection descriptors/fingerprints, or the
generic `migration` conformance check label: that label is only an existing
user-supplied verifier category and depends on no migration implementation.

`PostgresFieldOption.renamedFrom` is **used by direct synchronization**, through
schema compilation, desired schema and the synchronization planner. It stays,
including its public type, validation, Typegen declarations and rename tests.
No storage format, identifier, database table or persisted record is removed.

## Behavior after removal

Applications no longer declare migration-family metadata, request its privilege,
inspect upgrade intents through PostgreSQL, plan contribution transitions with
Core/testing, or suppress direct preparation by publishing the old marker.
Old runtime privilege/family inputs fail validation; old named imports/types
are absent. All generic capability and adapter ownership checks remain.

PostgreSQL always follows the existing explicit `schemaPolicy`: `override`,
`fail` or `ignore`. A caller formerly relying on the preparation marker must
explicitly select its intended policy; external schema management can use
existing `ignore`. There is no silent compatibility fallback for the marker
and no new callback or migration API. The default policy is unchanged.

Keep actual desired-schema compilation and lifecycle `prepareSchema`, physical
columns/indexes/constraints, codecs, `renamedFrom`, private password/session
storage, ownership/instance isolation, transaction-bound raw leases, rollback
and application cleanup. Removing the planner does not authorize implicit
destruction of orphaned plugin/private storage or weaken existing synchronization
protections. A future migration product still owns reviewed DDL and history;
it receives no speculative replacement extension point now.

## Engineering exception and verification

The used testing API and its migration-specific upgrade/orphan classification
guarantees are intentionally removed under this accepted decision. Do not copy the
planner into test support just to keep the same obsolete assertions alive.
Retain public E2E assertions on two physical contribution instances, trusted
owner/version/options attribution, immutable snapshots and changed/removed
providers through existing metadata. Keep actual PostgreSQL and private-storage
non-destruction tests distinct from that metadata-only proof.

3110 must run source/built/packed export/type checks, generic privilege-before-
effect and forged-owner checks, PostgreSQL synchronization/physical schema,
rename, private-storage/Password Auth, raw lease, cleanup and real database
tests. Compare SQL/desired state for current applications and retained coverage.
New consumers or deletions outside the table stop implementation for decision.

## Documentation and future backlog

In 3110 update Core/PostgreSQL/testing READMEs, root architecture/agent guidance,
and affected website pages: `plugins/official/postgresql`,
`plugins/build-a-plugin/index`, `plugins/build-a-plugin/runtime-and-infrastructure`.
Review `manual-installation`, `operations/before-exposing-your-application`,
`guides/test-an-application` and `project/roadmap`; retain accurate external
migration guidance and the distinction between synchronization and migrations.
Live API guidance changes in the implementation issue, not in this decision commit.

After acceptance, annotate future issues 513/514/515 and their milestone entry
with this boundary: migration snapshots/history/SQL remain future work and must
decide their integration against the then-current kernel before implementation;
515 cannot assume the removed preparation token. Preserve their dependency
chain and historical ADRs; do not create a replacement package or implement the
backlog. The historical milestone 30 matrix remains historical, with this exact
exception recorded in milestone 31.

## Alternative considered and outcome

Retain the migration scaffold and public testing helper if their present
engineering use justifies the maintenance cost; supersede 3110 in that case.
Recommended: remove the precisely listed protocol and helper, retaining current
persistence and generic conformance. Approval of Runtime or Typegen removal
does not approve this separate testing/public-contract exception.

Outcome: the user accepted the exact removal above. The implementation remains
bounded by this inventory and must complete its own validation/audit loop.
