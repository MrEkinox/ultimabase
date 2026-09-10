# Active plan: plugin-defined schema mutations and official soft delete

- Status: active
- Milestone: 26
- Started: 2026-09-10
- Governing decision: [ADR-0245](docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)
- Resume point: issue 2608

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
9. [ ] Issue 2608 — create the official soft-delete package and schema contract.
10. [ ] Issue 2609 — enforce tombstone visibility and write protection.
11. [ ] Issue 2610 — implement replace-delete mode.
12. [ ] Issue 2611 — implement the explicit `softDelete` mutation.
13. [ ] Issue 2612 — add private Master-only restore and purge commands.
14. [ ] Issue 2613 — prove the public cross-transport PostgreSQL vertical.
15. [ ] Issue 2614 — audit and close the milestone.

The authoritative acceptance criteria and dependency graph live in
[`issues/2600-plugin-schema-mutations-soft-delete/`](issues/2600-plugin-schema-mutations-soft-delete/README.md).

## Approved planning constraints

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

## Resume protocol

On every resumed task:

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

## Mandatory stop boundaries

- Issue 2601 must accept ADR-0245 before any public type, Runtime, policy,
  lifecycle, adapter, or transport contract changes.
- Stop if a schema mutation requires Core or a transport to name a concrete
  product operation, or if it exposes an engine, adapter, authority grant,
  persistence constraint, or mutable registry.
- Stop if plugin mutation execution would replay a native update/delete
  operation, lose its own logical identity, weaken accumulated constraints, or
  escape the root transaction.
- Stop before automatically exposing every plugin mutation, exposing restore or
  purge publicly, or manufacturing Master authority from transport input.
- Stop before include-deleted query APIs, configurable tombstone field names or
  values, time/user deletion metadata, cascade policy, nested soft delete,
  uniqueness reuse, partial indexes, retention jobs, or automatic purging.
- Stop if the exact public API requires `any`, deep imports, generated Runtime
  code, an official-engine dependency from Core, or a file-budget exception.

## Completion gate

The plan closes only after source and generated TypeScript, Typegen-free
JavaScript, packed packages, direct execution, REST, networkless GraphQL, Yoga,
PostgreSQL Testcontainers, Access, Hooks, rollback, relations, application
isolation, and security matrices prove the same semantics. The final issue runs
the complete repository validation sequence, reconciles documentation and
examples, archives this plan, and marks milestone 26 completed.
