# Completed plan: plugin-defined schema mutations and official soft delete

- Status: completed
- Milestone: 26
- Started: 2026-09-10
- Completed: 2026-09-11
- Governing decision: [ADR-0245](../../adr/0245-plugin-schema-mutations-and-soft-delete.md)
- Resume point: none

## Objective

Create one generic schema-mutation extension path that preserves exact logical
operation identity through application handles, Runtime, optional policy and
lifecycle engines, and generated transports. Use that foundation to ship the
official `@ultimabase/soft-delete-plugin` without teaching Core, REST, GraphQL,
Access, or Hooks a product-specific soft-delete branch.

## Accepted developer contract

The plugin supplies one application default and one direct per-schema option:

```ts
softDeletePlugin({ defaultMode: 'disabled' })

const Post = Schema.define({
	className: 'Post',
	softDelete: 'explicit',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})
```

`defaultMode` and the effective schema option use the modes `disabled`,
`replace-delete`, and `explicit`; a direct `false` always disables the plugin
for that schema. An omitted schema option inherits the plugin default. There is
no plugin-level schema allowlist.

In `replace-delete` mode, ordinary delete APIs retain logical delete Access,
Hooks, audit, results, and relation semantics while the persistence plan writes
the tombstone. In `explicit` mode, hard delete remains available and a separate
logical `softDelete` mutation is added to the application model surface:

```ts
await ultimabase.schema(Post).softDelete({ id })
```

When the schema is exposed, transports derive matching public operations from
the same generic mutation descriptor:

```text
POST /api/v1/classes/Post/{id}/soft-delete
softDeletePost(input: { id: ID! })
```

The official Access and Hooks plugins project the descriptor into typed
`access.softDelete`, `beforeOperation.softDelete`, and
`afterOperation.softDelete` declarations. The soft-delete package does not
install either engine and continues to enforce its structural and protected
visibility invariants when they are absent.

## Execution order

1. [x] Issue 2601 — accept the schema-mutation and soft-delete contract.
2. [x] Issue 2602 — declare generic plugin-owned schema mutations.
3. [x] Issue 2603 — execute schema mutations through Runtime and persistence.
4. [x] Issue 2604 — integrate optional Access semantics.
5. [x] Issue 2605 — integrate optional Hooks semantics.
6. [x] Issue 2606 — expose generic schema mutations in REST.
7. [x] Issue 2607 — expose generic schema mutations in GraphQL.
8. [x] Issue 2615 — add deterministic direct-option absence selection.
9. [x] Issue 2608 — create the official soft-delete package and schema contract.
10. [x] Issue 2609 — enforce tombstone visibility and write protection.
11. [x] Issue 2610 — implement replace-delete mode.
12. [x] Issue 2611 — implement the explicit `softDelete` mutation.
13. [x] Issue 2612 — add private Master-only restore and purge commands.
14. [x] Issue 2613 — prove the public cross-transport PostgreSQL vertical.
15. [x] Issue 2614 — audit and close the milestone.

The authoritative acceptance criteria and dependency graph live in
[`issues/2600-plugin-schema-mutations-soft-delete/`](../../../issues/2600-plugin-schema-mutations-soft-delete/).

## Frozen constraints

- Generic mutation identities are Core contracts; `softDelete`, `restore`, and
  `purge` remain plugin-owned vocabulary.
- Static contributions are synchronous, deterministic, owner-attributed, and
  callback-free. Runtime handlers remain application-bound capabilities.
- A schema mutation targets one exact schema and persisted ID, loads and locks
  the visible target when required, and executes in the ordinary automatic
  mutation transaction.
- The logical operation remains distinct from its physical persistence plan.
  An explicit soft delete is not implemented as a nested public update and
  therefore does not run update Access or update Hooks.
- Optional official Access and Hooks engines derive exact custom-operation keys
  from the compiled application graph. Independent engines may consume the
  generic kernel without depending on those packages.
- Generated REST and GraphQL mutations exist only for schemas already exposed
  by the corresponding transport. Transport exposure never grants authority.
- The soft-delete package contributes a protected stored boolean tombstone and
  rejects collisions. Arbitrary create, update, nested-write, and transport
  inputs cannot set it.
- Default reads, counts, existence checks, relationship traversal, mutation
  target lookup, and eager results exclude tombstoned rows through monotonic
  protected constraints. Master does not silently turn ordinary reads into an
  include-deleted query.
- `restore` preserves the stored identity and data; `purge` physically deletes
  an already tombstoned item and is irreversible. Both are explicit audited
  Master-only server commands with no generated REST or GraphQL endpoint.
- Source declarations and the compiled graph remain Runtime truth. Typegen may
  describe the resulting handles and options but emits no executable client.

## Verification protocol

Every issue followed the same verification protocol:

1. Read `AGENTS.md`, this plan, the milestone README, the selected issue, and
   every referenced ADR completely.
2. Verify dependency statuses and inspect the working tree before editing.
3. Keep work inside one issue plus its required tests, documentation, examples,
   and generated artifacts.
4. Run focused checks before the broader repository gates justified by the
   change.
5. Update issue status and evidence only after every criterion genuinely passes.
6. Create one dedicated commit after explicit approval and never push without a
   separate explicit request.

## Explicit first-release exclusions

- Core and transports do not name product mutations or expose an engine,
  adapter, authority grant, persistence constraint, or mutable registry.
- Plugin mutation execution does not replay native update or delete behavior,
  weaken accumulated constraints, or escape the root transaction.
- Restore and purge have no public transport endpoint, and transport input
  cannot manufacture Master authority.
- V1 has no include-deleted query API, configurable tombstone field or value,
  deletion time or actor metadata, cascade policy, nested or bulk soft delete,
  uniqueness reuse, partial-index strategy, retention job, or automatic purge.
- Public contracts contain no `any`, deep import, generated Runtime code,
  official-engine dependency from Core, or new file-budget exception.

## Completion evidence

- The generic schema-mutation identity is shared by declarations, application
  handles, Runtime, Access, Hooks, REST, GraphQL, Typegen, and protocol-2
  persistence plans. Static audits found no product-specific implementation in
  Core, transports, policy or lifecycle engines, and adapters.
- `@ultimabase/soft-delete-plugin` depends only on public Core, Plugin Kit, and
  Shared foundations. Its exact schema, constraint, rewrite, mutation,
  transport, and Typegen privileges are present in the official manifest
  inventory, while it installs no Access or Hooks engine and claims no host
  environment behavior.
- Direct TypeScript, Typegen-free JavaScript, replace and explicit semantics,
  native itemized delete batches, Access, Hooks, protected visibility, Master
  restore and purge, cancellation, rollback, relations, REST Fetch, networkless
  GraphQL, Yoga, application isolation, and PostgreSQL pass through one logical
  Runtime contract.
- The final gate passed 2,324 ordinary tests, 2,595 coverage tests, 155 packed
  package tests, and 341 built E2E tests. Coverage completed at 88.77%
  statements, 81.56% branches, 94.66% functions, and 89.32% lines.
  Constraints, issue metadata, TypeScript, lint, formatting, all package builds,
  `attw`, `publint`, source removal audits, and dependency checks also passed.

Milestone 26 is complete. Its accepted generic extension point and official
plugin are now part of the first-release scope; the exclusions above remain
future work rather than implicit APIs.
