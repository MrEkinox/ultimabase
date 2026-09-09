# Current plan: nested writes before the first release

- Status: active
- Milestone: 24
- Started: 2026-09-08
- Governing decision: [ADR-0243](docs/adr/0243-bounded-singular-nested-writes.md)
- Resume point: [issue 2407](issues/2400-nested-writes/2407-nested-write-public-vertical.md)

## Objective

Add schema-aware nested writes before the first usable release so one root
`createOne` or `updateOne` can describe an atomic graph of pointer and relation
work inside `data`. Direct TypeScript, REST, and GraphQL must normalize into one
Core-owned graph whose every object and relation mutation uses the ordinary
Runtime, Access, ACL, Validation, Hooks, transaction, and persistence pipeline.

## Candidate developer contract

The public mutation input keeps nested commands beside scalar update commands:

```ts
await Post.createOne({
	data: {
		title: 'Hello',
		author: { connect: authorId },
		comments: {
			create: [{ body: 'First comment' }],
			connect: [existingCommentId],
		},
	},
	include: { author: true, comments: true },
})
```

Pointer inputs may expose `connect`, `create`, `update`, and `disconnect` where
the root operation and field nullability permit them. Relation inputs may
expose `connect`, `create`, `update`, `disconnect`, `set`, and `clear`.
Field-bound identity commands accept only the target object's canonical string
ID because the field already identifies the exact target schema.

Public `data` is developer syntax, not the executable representation. Core
must normalize nested commands into an immutable callback-free mutation graph
before effects begin. Persisted scalar candidates, protected relation deltas,
and child mutation commands then enter their existing focused Runtime
boundaries rather than treating command objects as stored field values.

REST retains concise create and patch bodies. GraphQL generates source-field
specific nested input objects and keeps its existing scalar update wrappers.
Both transports delegate only through the narrow application request executor.

## Execution order

1. [x] Issue 2401 — accept the nested-write contract and execution semantics.
2. [x] Issue 2402 — compile exact nested input types and the immutable Core graph.
3. [x] Issue 2403 — execute nested `create` and `connect` atomically.
4. [x] Issue 2404 — execute nested `update`, `disconnect`, `set`, and `clear`.
5. [x] Issue 2405 — decode and execute nested writes through REST v1.
6. [x] Issue 2406 — generate and execute nested writes through GraphQL v1.
7. [ ] Issue 2407 — prove the public cross-transport PostgreSQL vertical.
8. [ ] Issue 2408 — audit and close the pre-release nested-write milestone.

The authoritative acceptance criteria and dependencies live in
[`issues/2400-nested-writes/`](issues/2400-nested-writes/).

## Decisions accepted by ADR-0243

- The exact create and update command matrix for pointer and relation fields.
- Whether one relation input may combine non-conflicting incremental commands,
  their deterministic execution order, and which combinations fail before any
  effect.
- Dependency ordering for pointer-created targets, source rows, inverse-pointer
  children, owning relation edges, object hooks, and final projections.
- Required-pointer behavior, protected not-found equivalence, referential
  actions, recursive graphs, maximum depth, and maximum operation count.
- The removal audit for pointer/model targets currently accepted by relation
  mutation handles and tagged pointer values currently accepted as transport
  mutation input.
- Stable REST and GraphQL wire shapes, error ownership, introspection names,
  and schema-aware decoding.

## Frozen constraints

- Nested commands live in the public `data` object and are legal only on exact
  pointer or relation fields.
- `connect`, `disconnect`, and `set` use canonical string IDs when the field
  already supplies target schema identity.
- Core owns one transport-neutral normalized graph. REST and GraphQL add no
  executable graph nodes, policy branches, transaction logic, or adapter calls.
- Every nested object mutation traverses the same application request and
  Runtime behavior as its standalone equivalent. Root permission never grants
  child permission.
- Every relation change uses Core's existing protected relation mutation
  boundary and retains source-field Access plus target visibility checks.
- One outer automatic transaction commits the complete graph or rolls it back.
  Partial success and adapter-specific nested-write shortcuts are forbidden.
- Master, plugin-owned request values, cancellation, application provenance,
  transaction ownership, and callback attribution remain exact for every node.
- Nested result hydration reuses the existing transaction-bound `include`
  projection after the accepted graph semantics complete.
- Typegen remains declarations only. JavaScript applications execute the same
  compiled graph without a generated file or client.
- Nested target `delete` and `upsert`, bulk roots with nested data, temporary
  object references, arbitrary unique-filter connect, and database-specific
  nested syntax are outside this milestone.

## Resume protocol

On every resumed task:

1. Read `AGENTS.md`, this plan, the milestone README, the current issue, and its
   referenced ADRs completely.
2. Verify every dependency status and inspect the working tree before editing.
3. Keep work inside one issue plus its tests, documentation, and generated
   artifacts.
4. Run focused type, Runtime, transport, and PostgreSQL checks before broader
   repository validation.
5. Update an issue or checklist only after its criteria genuinely pass.
6. Create one dedicated commit after explicit approval and never push without
   a separate explicit request.

## Mandatory stop boundaries

- ADR-0243 was accepted only after explicit approval of the complete public
  syntax, graph ordering, Hook timing, Access behavior, conflict rules, limits,
  replacement removals, and REST/GraphQL contracts.
- Stop if nested execution would bypass the application request executor, open
  a second transaction, issue raw adapter work, or add transport vocabulary to
  Core.
- Stop if parent authority, identity, Access, or field permission would grant
  a child operation access it would not receive as a standalone mutation.
- Stop before exposing provisional object references, cyclic create graphs,
  partial success, nested target deletion/upsert, bulk-root nesting, or
  arbitrary unique-filter connect.
- Stop if exact recursive input typing would require `any`, generated Runtime
  code, a mutable registry, a deep import, or a file-size baseline increase.

## Completion and handoff

After issue 2408 passes the full repository, built-package, Typegen-free,
archive, browser, performance, coverage, multi-application, and PostgreSQL
gates, archive this file under `docs/plans/completed/`, mark milestone 24
completed, and reconcile the release checklist and roadmap.
