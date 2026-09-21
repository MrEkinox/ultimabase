# Implementation plans

`CURRENT_PLAN.md`, when present at the repository root, owns the active
multi-issue objective. This directory preserves paused and completed plans so
architectural context and verified developer flows are not lost when execution
priority changes.

## Active

- [Residual complexity simplification](2026-09-21-residual-complexity-simplification.md),
  milestone 31, issues 3101–3112, authorized for autonomous execution with
  per-issue audits and commits. 3101–3103 are complete; next issue: 3104. The
  [candidate inventory](2026-09-21-residual-complexity-inventory.md) distinguishes
  internal cleanup from pending compiler and public-contract decisions.

## Paused

- [ACL hardening and developer-experience consolidation](paused/acl-hardening-and-developer-experience-consolidation.md),
  resumable at issue 432 only after explicit user direction.

## Completed

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
