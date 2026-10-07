# 6307: Migrate Access, Hooks, and Validation source typing

- Status: completed
- Milestone: 63
- Packages: `@ultimabase/access-plugin`, `@ultimabase/hooks-plugin`, `@ultimabase/validation-plugin`
- Depends on: 6306
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Migrate every locally decidable part of the three callback verticals to the
source-type projection contract while preserving their exact policy, lifecycle,
validation, provider, and editor semantics without package-specific bridges.
Schema-level Access and Hooks remain references in the sole Typegen graph under
ADR-0280 because their callbacks require the completed schema contract.

The implementation audit established that this issue must close the complete
schema-declaration layer rather than stop at package boundaries. It therefore
also migrates the ACL and Soft Delete schema options and contributed fields,
plus the generic configured specialization needed by package-owned schemas such
as `RoleSchema`. Their operation, business, persistence, and transport behavior
remains assigned to the later package migration issues.

## Acceptance criteria

- [x] Field Access, field Hooks, and Validation infer exact local values and callback documentation from source; schema Access and Hooks infer exact items, filters, operations, relationships, and plugin mutation keys from the retained Typegen graph.
- [x] Access preserves default denial, operation and mutation rules, row filters, item checks, field restrictions, relation writes, protected output narrowing, diagnostics, compatible providers, and Master bypass.
- [x] Hooks preserves field/schema/global order, transaction timing, plugin mutation phases, callback attribution, cancellation, events, diagnostics, and compatible providers.
- [x] Validation preserves Standard Schema compatibility, final-input timing, arithmetic projection, rejection-only semantics, nested values, and absence from result/read boundaries.
- [x] Multiple explicit instances, dependencies, compatible community providers, direct options, field options, and plugin-absence diagnostics remain exact.
- [x] No official package uses a private Core import or a capability unavailable to an equivalent community plugin.
- [x] Superseded field-option Typegen descriptors and compatibility branches are removed; only the justified schema `access` and `hooks` descriptors remain.
- [x] Package READMEs, examples, and public documentation are updated in each affected package change.
- [x] Documentation impact is recorded.

## Tests

- [x] Existing unit, type, editor, E2E, PostgreSQL E2E, security, and conformance suites migrate without dropped assertions.
- [x] Source and packed applications prove source-owned field options, generated schema callbacks, plugin absence, compatible-provider surfaces, and relationship names through one retained graph.
- [x] Locked TypeScript performance and memory budgets.
- [x] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [x] Record the starting revision and one explicit capability/test/documentation inventory for Access, Hooks, Validation, and each compatible-provider boundary.
- [x] Audit the complete diff plugin by plugin for policy broadening, callback reorder, validation replay or transformation, private Core access, per-plugin bridges, duplicate declarations, instance/order changes, stale Typegen, missing packed/source assertions, and postponed documentation.
- [x] Record each finding and correction in the handoff; rerun the affected plugin vertical plus the complete cross-plugin audit until no finding remains.
- [x] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; no plugin may be declared migrated while one retained assertion or integration is absent or red.
- [x] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [x] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- ACL, Roles, Password Auth, Soft Delete, vector, database, transport, and
  application-only operation, business, persistence, and transport migration
  beyond the schema-declaration surfaces required to keep this issue green.
- Adding a new plugin or weakening a plugin contract to fit the new type system.
- Keeping a plugin-specific generated declaration fallback outside ADR-0280's two schema option descriptors in the retained cross-schema graph.

## Completed issue handoff

- Starting revision: `7bb941a0`.
- The user approved continuing milestone 63 after reviewing the issue audit.
  Issue 6308 starts only after this issue's dedicated commit is inspected.
- Documentation impact: **both**. ADR-0280 and the milestone engineering
  contract record the retained complete-schema boundary; package READMEs,
  official plugin pages, the plugin-usage guide, Quick Start, landing examples,
  create-app output, and repository examples now teach the configured factory.

### Capability inventory

| Boundary         | Source-owned after 6307                                               | Retained behavior and proof                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access           | field `access` values, relation changes, exact nullable/list values   | schema rules remain exact through Typegen; default denial, filters, item checks, mutation rules, compatible providers, Master bypass, source/packed editor and PostgreSQL suites pass |
| Hooks            | field `hooks` values and mutation inputs                              | schema callbacks remain exact through Typegen; order, transaction timing, cancellation, events, plugin mutations, source/packed editor and PostgreSQL suites pass                     |
| Validation       | field `validation` and Standard Schema compatibility                  | final-input, arithmetic, nested-value, rejection-only and result-boundary suites pass without generated Validation declarations                                                       |
| ACL              | direct schema option and contributed `acl` field                      | monotonic policy, defaults, input resolution, role composition, cleanup and event suites pass without `ACLSchemaOption` generation                                                    |
| Soft Delete      | explicit schema option, tombstone field and explicit command surfaces | visibility, replace-delete, administration, events and PostgreSQL behavior pass; factory-default source projection remains assigned to issue 6309                                     |
| Roles            | configured package-specialized Role schema                            | custom fields, Access, identity, hierarchy, member resolution and persisted reference commands pass; Runtime remains the same specialized schema implementation                       |
| Vector/community | configured builder and registrar-derived projections                  | vector presence/absence, community provider parity, multiple instances and packed declarations pass; physical vector persistence remains out of scope                                 |

### Typegen boundary after the change

Typegen remains responsible for the application-wide schema-name graph:
schema items, query/input contracts, circular and cross-file string
relationships, plugin field value references, and the two complete-schema
option references `SchemaAccessOption<this>` and `SchemaHooksOption<this>`.
Field Access, field Hooks, Validation, ACL, configured plugin builders, local
options and the migrated command surfaces no longer emit parallel declarations.
There is no source schema registry and Typegen remains inert declaration
output, never Runtime truth.

### Audit findings and corrections

1. Repeated source-only attempts for schema Access and Hooks reproduced TS7022,
   TS2615 and generic-to-complete-schema incompatibilities. The experimental
   marker branch was deleted; ADR-0280 retains those two descriptors in the one
   existing graph instead of weakening callbacks or adding a registry.
2. A package-only migration left ACL, Soft Delete and package-specialized
   schemas on a split declaration model. The scope was corrected to finish the
   schema-declaration layer while leaving their later business/transport work
   in issues 6308 and 6309.
3. Complete coverage exposed stale ACL, packed Typegen, create-app and landing
   fixtures. Each was migrated to the configured factory; a freshly generated
   TypeScript starter builds successfully.
4. The first green full gate was 0.01 point below issue 6306 in branches and
   lines. Missing configured Role namespace and persisted-reference regressions
   were added; the final coverage is now above the prior checkpoint in all four
   percentages.
5. The final audit tested removing explicit ACL and Soft Delete projection
   annotations. `isolatedDeclarations` correctly rejected the unnamed inferred
   public types, so the experiment was fully reverted instead of adding exports
   or weakening the package build contract.

### Validation evidence

The final milestone audit consolidates the preceding recorded corrections into
an iteration table; it does not invent additional runs or change their results.

| Iteration | Recorded finding                                                                                  | Correction and evidence                                                                                  | Remaining work at that checkpoint                                                    |
| --------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1         | Source-only schema callbacks failed with TS7022/TS2615 and incompatible complete-schema generics. | Removed the experimental marker; ADR-0280 retains exact Access/Hooks contexts in the single graph.       | Complete the package declaration migration.                                          |
| 2         | ACL, Soft Delete and specialized schemas still used split declaration authoring.                  | Migrated their declaration layer, retaining later business/transport issue ownership.                    | Complete coverage and public examples.                                               |
| 3         | Coverage exposed stale ACL, Typegen, initializer and landing fixtures.                            | Updated the fixtures; the generated TypeScript starter builds.                                           | Reconcile the first coverage drop.                                                   |
| 4         | Branch/line coverage was 0.01 point below 6306.                                                   | Added Role namespace and persisted-reference regressions; final percentages exceed the prior checkpoint. | Final public declaration audit.                                                      |
| 5         | Removing explicit public projection annotations failed isolated declarations.                     | Reverted the experiment; the full gate below passes without weakening package compilation.               | No issue-local implementation finding; retained graph and size costs belong to 6316. |

- `yarn validate:full`: passed.
- Ordinary suite: 557/557 files, 2,629/2,629 tests, no type errors.
- Complete coverage suite: 635/635 files, 2,886/2,886 tests, no type errors.
- Coverage: 90.85% statements (23,874/26,278), 84.35% branches
  (14,759/17,496), 96.03% functions (5,020/5,227), 91.42% lines
  (23,148/25,320).
- Website: 17/17 files and 66/66 tests.
- Build, lint, package publication checks, issue metadata, dependency
  constraints and formatting pass.
- Locked three-process 1/10/50-schema benchmark passes; at 50 schemas the
  hybrid form is 61.0% faster for cold checking, 79.1% faster for edit
  diagnostics, 78.3% smaller in generated declarations, 58.0% lower in peak
  heap and 14.4% faster for language-service initialization. Generation is
  5.0% slower.

### Size and remaining review points

- Final staged diff: **4,084 additions / 2,197 deletions across 167 paths**.
  Handwritten production and website TypeScript accounts for +2,162/-1,013,
  tests and fixtures for +1,267/-767, Markdown documentation/planning for
  +647/-324, and generated declarations for +8/-93. These four categories
  partition every changed path in the dedicated issue commit.
- Three production files newly cross the warning threshold: Core
  `schema-declaration-contracts.ts` (402 lines), Core `source-projections.ts`
  (434), and Roles `role-schema.ts` (537). None crosses the 600-line failure
  limit. The user requested that their added debt be reassessed and, where
  beneficial, fixed at the final milestone audit (issue 6316), without expanding
  this issue's functional migration.
- No behavior, capability, public callback precision, Runtime stage, privilege,
  provider boundary or plugin ordering was intentionally removed. The material
  compromise is the retained Typegen graph described by ADR-0280.
