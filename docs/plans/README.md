# Implementation plans

> **Archive of the reference.** These plans and the root `CURRENT_PLAN.md` are
> the frozen planning record of the reference implementation (commit
> `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`). No plan is active in this
> repository: the package-by-package rebuild is planned and tracked in
> [`docs/rebuild/`](../rebuild/HANDOFF.md). Module paths named in these plans
> describe the reference layout; see [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
> for the current one. The catalog below is kept unchanged because the
> checkpoint guard (`tooling/issues/current-plan.test.ts`) still checks it.

`CURRENT_PLAN.md`, when present at the repository root, owns the active
multi-issue objective. This directory preserves paused and completed plans so
architectural context and verified developer flows are not lost when execution
priority changes. The root checkpoint stays at most 80 lines; execution history
belongs here or in issue evidence, not in startup instructions.

## Active

None.

## Paused

- [ACL hardening and developer-experience consolidation](paused/acl-hardening-and-developer-experience-consolidation.md),
  resumable at issue 432 only after explicit user direction.

## Completed

- [Core path simplification canaries](../../issues/6700-core-path-simplification/README.md),
  milestone 67, issues 6701–6704; eleven trials retained, net 161 production
  lines removed across three passes, full and compiled validation passed.
  Follow-up type-fest trial rejected and fully rolled back.
- [Standard mechanics canaries](../../issues/6600-standard-mechanics-canaries/README.md),
  milestone 66; GraphQL collection and cookie-route simplification retained,
  native discovery, fdir and Manypkg rejected.
- [Standard package simplification](completed/standard-package-simplification.md),
  milestone 65; GraphQL Tools retained, Valibot and atomic writer rejected.
- [Scoped agent context](../../issues/6400-scoped-agent-context/README.md),
  milestone 64, issue 6401.
- [Source-typed application authoring target](2026-09-28-source-typed-application-authoring-target.md),
  milestone 63, accepted with explicit costs in ADR-0286. See the
  [final audit](../../issues/6300-source-typed-application-authoring/evidence/6316-final-audit.md)
  and [historical execution log](completed/source-typed-application-authoring-execution-log.md).
- [Future complexity reduction](2026-09-28-future-complexity-reduction-final-audit.md),
  milestone 62, issues 6201–6207.
- [Residual complexity simplification](2026-09-21-residual-complexity-simplification.md),
  milestone 31, issues 3101–3112.
- [Pre-feature architecture simplification](2026-09-20-pre-feature-architecture-simplification.md),
  archived in place after issue 3034 with its
  [final audit](2026-09-21-milestone-30-final-audit.md),
  [baseline](2026-09-20-architecture-simplification-baseline.md),
  [contract matrix](2026-09-20-architecture-contract-matrix.md) and
  [execution log](completed/pre-feature-architecture-simplification-execution-log.md). All Core,
  plugin and public website audit loops are complete; that run authorizes no
  later milestone.
- [Interactive project initializer](completed/interactive-project-initializer.md)
- [Public website and documentation foundation](completed/public-website-and-documentation-foundation.md)
- [Contextual relation filters](completed/contextual-relation-filters.md)
- [Plugin-defined schema mutations and official soft delete](completed/plugin-defined-schema-mutations-and-official-soft-delete.md)
- [Contextual fields and virtual results](completed/contextual-fields-and-virtual-results.md)
- [Nested writes before the first release](completed/nested-writes-before-first-release.md)
- [HTTP, REST, and password authentication](completed/http-rest-and-password-auth.md)
- [Generated schema authoring and type contracts](completed/generated-schema-authoring-and-type-contracts.md)
- [Optional field validation plugin](completed/optional-field-validation-plugin.md)
- [Single-pass field validation](completed/single-pass-field-validation.md)
- [Standard Schema field validation](completed/standard-schema-field-validation.md)
- [Trusted open plugin kernel and optional official capabilities](completed/trusted-open-plugin-kernel-and-optional-official-capabilities.md)
- [Query execution and enforcement consolidation](completed/query-execution-and-enforcement-consolidation.md)
- [Pre-feature codebase consolidation](completed/pre-feature-codebase-consolidation.md)
- [Explicit Typegen package identity](completed/explicit-typegen-package-identity.md)
- [Singular identifier target aliases](completed/singular-identifier-target-aliases.md)
- [Mutation relationship projections](completed/mutation-relationship-projections.md)
- [Runtime-to-PostgreSQL E2E](completed/runtime-postgres-e2e.md)
- [Native hooks and contextual execution](completed/native-hooks-and-contextual-execution.md)
- [Fundamental Access system](completed/fundamental-access-system.md)
- [Transport-neutral pointers and relations](completed/transport-neutral-relations.md)
- [Developer-defined stored roles](completed/developer-defined-stored-roles.md)
- [Persisted object ACL](completed/persisted-object-acl.md)
