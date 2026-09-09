# Current plan: contextual fields and virtual results

- Status: active
- Milestone: 25
- Started: 2026-09-09
- Governing decision: [ADR-0244](docs/adr/0244-contextual-fields-and-virtual-results.md)
- Resume point: [issue 2505](issues/2500-contextual-fields-virtual-results/2505-virtual-field-schema-typegen.md)

## Objective

Make every field-building surface expose only behavior that its declaration
context can execute, then add first-class virtual result fields on top of that
foundation. A virtual field declares an output-only value shape, a private flat
selection of persisted source fields, and a synchronous or asynchronous
request-context-aware resolver. It is selectable through direct TypeScript,
REST, and GraphQL while remaining absent from storage, migrations, mutation
inputs, filters, and ordering.

## Candidate developer contract

Stored object children retain the familiar factories through a deliberately
restricted embedded builder:

```ts
profile: field.object({
	fields: (embedded) => ({
		name: embedded.string({ required: true, default: 'Anonymous' }),
	}),
})
```

The embedded builder must not advertise a relationship, dedicated-column,
portable index, unsupported generator, plugin option, or other behavior that
cannot execute for one property of the parent stored value.

Virtual fields stay in the canonical schema field map but describe their
result through a separate output-only builder:

```ts
displayName: field.virtual({
	output: (output) => output.string({ nullable: false }),
	select: { firstName: true, lastName: true },
	resolve: async ({ item, context }) => {
		const principal = context.getValue(authenticatedPrincipal)

		return principal?.id === item.id
			? `${item.firstName} ${item.lastName}`
			: item.firstName
	},
})
```

`output.object(...)` recursively receives the same output-only builder. Output
descriptors express value shape, nullability, lists, documentation, and
kind-specific representation metadata without gaining mutation or persistence
semantics.

## Execution order

1. [x] Issue 2501 — accept the contextual-field and virtual-result contract.
2. [x] Issue 2502 — make embedded built-in field declarations truthful.
3. [x] Issue 2503 — add output-only value descriptors and `OutputBuilder`.
4. [x] Issue 2504 — contextualize plugin field methods, options, and Typegen.
5. [ ] Issue 2505 — compile virtual schema fields and generated contracts.
6. [ ] Issue 2506 — execute request-aware asynchronous virtual resolvers.
7. [ ] Issue 2507 — keep PostgreSQL storage physical while loading dependencies.
8. [ ] Issue 2508 — expose virtual result fields through REST.
9. [ ] Issue 2509 — expose virtual result fields through GraphQL.
10. [ ] Issue 2510 — prove the public cross-transport virtual-field vertical.
11. [ ] Issue 2511 — audit and close the milestone.

The authoritative acceptance criteria and dependencies live in
[`issues/2500-contextual-fields-virtual-results/`](issues/2500-contextual-fields-virtual-results/).

## Frozen constraints

- Static source declarations remain Runtime truth. Typegen supplies exact
  application typing but never executable resolver code or required metadata.
- Contextual builders narrow both TypeScript autocomplete and Runtime
  validation. A stale declaration cannot activate an option in the wrong
  context.
- `field.virtual({ output, select, resolve })` is a Core schema capability, not
  a Hooks output phase or an adapter-specific generated column.
- A virtual dependency selection uses the existing flat boolean selection
  vocabulary but may name only persisted fields in v1. It cannot select another
  virtual field or traverse a relationship.
- The resolver receives `{ item, context }`. `item` is the exact immutable
  private dependency projection plus canonical `id`, independent from unrelated
  caller selections. `context` is the operation's real immutable
  `RequestContext`.
- Core may load an authorized virtual field's dependencies privately even when
  those source fields are not public output fields. Only the virtual field's
  separately enforced output may leave the Runtime boundary.
- Resolvers may return a value or a Promise. Core preserves result order,
  cancellation, callback attribution, error safety, application isolation, and
  automatic mutation rollback.
- Resolver conditions are presentation logic, not authorization. Access and
  other protected policies remain the only permission boundary.
- Virtual fields are selectable and part of complete result projections. They
  never enter create, update, upsert, nested-write, where, orderBy, storage,
  index, synchronization, migration, or raw adapter contracts.
- PostgreSQL receives only persisted dependency fields. REST and GraphQL own
  only wire selection and output representation.

## Resume protocol

On every resumed task:

1. Read `AGENTS.md`, this plan, the milestone README, the current issue, and its
   referenced ADRs completely.
2. Verify every dependency status and inspect the working tree before editing.
3. Keep work inside one issue plus its tests, documentation, examples, and
   generated artifacts.
4. Run focused type, Runtime, transport, and PostgreSQL checks before broader
   repository validation.
5. Update an issue or checklist only after its criteria genuinely pass.
6. Create one dedicated commit after explicit approval and never push without
   a separate explicit request.

## Mandatory stop boundaries

- Issue 2501 must accept ADR-0244 before a public builder, Typegen, Runtime,
  adapter, or transport contract changes.
- Stop if contextual option filtering would silently discard invalid options
  instead of rejecting them at declaration or application compilation.
- Stop if a virtual resolver requires generated Runtime code, a public engine,
  a raw adapter, a mutable global registry, transport input context, or a
  reintroduced field `resolveOutput` hook.
- Stop before virtual-to-virtual dependencies, relationship traversal,
  filtering, ordering, persistence pushdown, cross-request caching, resolver
  side effects, or a public batching API.
- Stop if asynchronous collection resolution has no accepted deterministic and
  bounded resource policy.
- Stop if exact public APIs require `any`, deep imports, an application-specific
  Core dependency, or a file-size baseline increase.

## Completion and handoff

After issue 2511 passes the full repository, generated-contract,
Typegen-free, package-archive, cross-transport, performance, concurrency,
multi-application, and PostgreSQL gates, archive this file under
`docs/plans/completed/`, mark milestone 25 completed, and reconcile the release
scope and roadmap.
