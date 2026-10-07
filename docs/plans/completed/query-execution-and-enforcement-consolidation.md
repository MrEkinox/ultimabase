# Completed plan: Query execution and enforcement consolidation

- Status: complete
- Started: 2026-08-11
- Completed: 2026-08-11
- Objective owner: `@ultimabase/core`
- Milestone: [13 — Query execution and enforcement consolidation](../../../issues/1300-query-enforcement-consolidation/README.md)
- Paused objectives:
  - [ACL hardening and developer-experience consolidation](../paused/acl-hardening-and-developer-experience-consolidation.md)
  - [Generated schema authoring and type contracts](generated-schema-authoring-and-type-contracts.md)

## Objective

Remove verified dead Query execution helpers, separate immutable public Query
authoring from framework-owned scopes and operation execution, and decompose
policy-neutral Enforcement algorithms while preserving every accepted public
contract and Runtime security invariant.

## Frozen constraints

- `QueryBuilder` remains an immutable, unbound, read-oriented authoring API with its existing root exports, methods, inference, autocomplete, and hovers.
- Query and Operation ASTs retain no request, authority, Runtime, adapter, transport, or private relation state.
- Generated schema collection commands remain ordered itemized singular operations in one automatic transaction.
- Low-level set-based operation AST and adapter capabilities remain available for current internal consumers; this plan removes only helpers proven unreachable.
- Private pointer, object-identity, and relation scopes remain outside the transformable public AST and survive execution through the existing Runtime bridge.
- Enforcement remains monotonic: guards only deny, constraints append with logical `AND`, and input, selection, and output fields only narrow.
- Native Access and low-level plugin enforcement retain their current order, target recursion, master behavior, and application-local ownership.
- Runtime gains no ACL, role, authentication, permission-provider, or neutral placeholder behavior.
- No new public API, operation kind, AST node, stage, bypass, adapter capability, extension point, or product feature is introduced.
- `where.ts`, Runtime Validation, hook boundaries, PostgreSQL prepared operations, ACL, roles, and Typegen are outside this objective.
- No `any`, deep package import, infrastructure dependency in Core, or net increase in double assertions is allowed.
- Every issue receives a dedicated commit and no push occurs without explicit user confirmation.

## Execution order

1. [x] [1301 — Remove unused Query mutation execution helpers](../../../issues/1300-query-enforcement-consolidation/1301-remove-unused-query-mutation-helpers.md)
2. [x] [1302 — Separate Query authoring from private execution](../../../issues/1300-query-enforcement-consolidation/1302-separate-query-authoring-and-execution.md)
3. [x] [1303 — Decompose policy-neutral Enforcement dispatch](../../../issues/1300-query-enforcement-consolidation/1303-decompose-enforcement-dispatch.md)

## Intentional remaining boundaries

- Query filtering remains one substantial typed vocabulary because its object
  input, builder utility, normalization, and portable AST must stay exactly
  correlated. This plan does not split `where.ts` or add another query
  representation.
- Runtime Validation, native hooks, and native Access retain their established
  coordinators. Their order and security semantics are separate accepted
  contracts rather than Enforcement responsibilities.
- Low-level set-based operation and adapter capabilities remain available for
  current internal consumers. Public schema collection commands continue to
  itemize singular operations atomically.
- ACL cleanup and role hardening remain untouched and resumable at paused issue 432. Typegen editor-performance verification remains paused at issue 810.

## Final validation

- The four unreachable Query mutation helpers are absent from source and built
  implementation output. Schema collection commands retain their ordered
  `executeOperationBatch` path.
- Query authoring, framework-private scopes, and operation execution have
  focused internal owners. Models, pointers, relations, and schema commands
  reuse the same protected bridge.
- Enforcement contribution evaluation, operation restrictions, relation
  planning, and result restrictions have focused internal owners.
  `createEnforcementStages` retains application validation, immutable
  composition, native Access delegation, and its established stage contract.
- Source and packed negative tests prove no extracted Query or Enforcement
  implementation name leaks through Core's public exports. The built Core
  `index.d.ts` remains byte-identical with SHA-256
  `95cdae76eeb73c73723669256bb308e1213fc31da8e7e93d028fcbba2a310ed8`.
- Touched Enforcement production code retains exactly three double assertions
  and two `never` erasures before and after decomposition. The milestone adds
  no `any`, deep import, concrete policy dependency, public export, or
  speculative extension.
- Repository unit and type suites: 290 files, 1,819 tests, no type errors.
- Focused Enforcement, relation, Access, and Runtime suites: 7 files, 74 tests,
  no type errors.
- Coverage: 90.59% statements, 83.88% branches, 94.44% functions, and 90.74%
  lines. The extracted Enforcement area reaches 96.07% statements, 89.5%
  branches, 96.05% functions, and 96.06% lines.
- Packed packages: 7 files, 50 tests.
- Complete built cross-package and PostgreSQL E2E: 27 files, 127 tests.
- Constraints, typecheck, lint, formatting, build, Changesets validation, and
  diff checks all pass.
