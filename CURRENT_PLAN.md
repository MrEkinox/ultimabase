# Active plan: Query execution and enforcement consolidation

- Status: active
- Started: 2026-08-11
- Objective owner: `@ultimabase/core`
- Milestone: [13 — Query execution and enforcement consolidation](issues/1300-query-enforcement-consolidation/README.md)
- Previous completed plan: [Pre-feature codebase consolidation](docs/plans/completed/pre-feature-codebase-consolidation.md)
- Paused objectives:
  - [ACL hardening and developer-experience consolidation](docs/plans/paused/acl-hardening-and-developer-experience-consolidation.md)
  - [Generated schema authoring and type contracts](docs/plans/paused/generated-schema-authoring-and-type-contracts.md)

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

1. [x] [1301 — Remove unused Query mutation execution helpers](issues/1300-query-enforcement-consolidation/1301-remove-unused-query-mutation-helpers.md)
2. [ ] [1302 — Separate Query authoring from private execution](issues/1300-query-enforcement-consolidation/1302-separate-query-authoring-and-execution.md)
3. [ ] [1303 — Decompose policy-neutral Enforcement dispatch](issues/1300-query-enforcement-consolidation/1303-decompose-enforcement-dispatch.md)

## Supervision checkpoints

- After 1301: prove the four removed helpers had no caller or public declaration and that schema collection commands still itemize through `executeOperationBatch`.
- During 1302: stop if the extraction requires a public hydration API, Query execution method, mutable builder state, or private scope inside the Query AST.
- After 1302: demonstrate unchanged source and packed QueryBuilder inference plus pointer, relation, model, and schema-command execution through one private bridge.
- During 1303: stop before any stage-order, monotonicity, relation-visibility, master-bypass, Access, provider, or adapter-contract change.
- After 1303: report full source, packed, coverage, and PostgreSQL E2E evidence and archive this plan only when all three issues are complete.

## Completion gate

- The four unreachable Query mutation execution helpers and their dead-only imports are absent from source and packed implementation output.
- Public QueryBuilder declarations, inference, immutability, AST shape, and developer-facing hovers remain unchanged.
- Query authoring, framework-private scopes, and operation execution have focused internal ownership without leaking new root exports.
- `createEnforcementStages` retains application-local composition while contribution evaluation, relation planning, mutation input checks, and result restrictions have focused ownership.
- Native Access, low-level enforcement, relation predicates, master behavior, automatic transactions, hooks, and adapters retain their accepted semantics.
- Touched production files contain no `any` or deep import and do not increase double assertions.
- Repository typecheck, unit/type tests, lint, formatting, constraints, build, package archives, coverage, and complete PostgreSQL E2E pass.
