# Completed plan: contextual relation filters

- Status: completed
- Milestone: 27
- Started: 2026-09-11
- Completed: 2026-09-11
- Governing decision: [ADR-0247](../../adr/0247-contextual-relation-filters.md)
- Resume point: none

## Objective

Let a relation field declare one target-typed static or request-contextual
`where` that defines the visible read subset of that relation. Core resolves
and composes the filter through the ordinary Query and Runtime pipeline so
direct TypeScript, REST, GraphQL, Yoga, and every database adapter observe one
contract without adding adapter-specific relation behavior.

## Accepted developer contract

A relation may declare a static target filter:

```ts
comments: field.relation({
	target: 'Comment',
	where: {
		published: { eq: true },
	},
})
```

Or it may derive that filter synchronously from the exact request context and
a target-typed immutable `WhereBuilder`:

```ts
participants: field.relation({
	target: 'User',
	where: ({ context, where }) => {
		const currentUserId = context.getValue(currentUserIdContext)

		return currentUserId === undefined ? where : where.ne('id', currentUserId)
	},
})
```

For every read through the field, Core constructs the effective target scope as:

```text
relation where
AND caller where
AND target policy and protected constraints
AND physical relation membership
```

The relation filter is ordinary result shaping, not authorization. It is not
implicitly bypassed by Master and cannot broaden Access, ACL, or another
protected constraint.

## Execution order

1. [x] Issue 2701 — accept the contextual relation-filter contract.
2. [x] Issue 2702 — declare the exact typed relation `where` API.
3. [x] Issue 2703 — resolve contextual filters for direct relation reads.
4. [x] Issue 2704 — apply filters to eager relation inclusions.
5. [x] Issue 2705 — compose filters into relation predicates and cardinality.
6. [x] Issue 2706 — prove public transport and PostgreSQL parity.
7. [x] Issue 2707 — audit and close the milestone.

The authoritative acceptance criteria and dependency graph live in
[`issues/2700-contextual-relation-filters/`](../../../issues/2700-contextual-relation-filters/).

## Frozen constraints

- `where` belongs to Core's relation-field contract, never to Drizzle or one
  transport.
- The static form is target-typed. The contextual form receives only the exact
  immutable `RequestContext` and target-typed `WhereBuilder`; it receives no
  source object, adapter, engine, transport request, transaction, or authority
  grant.
- V1 callbacks are synchronous. Thenables and malformed returns fail before
  database work through a safe Core boundary.
- The resolved relation filter always combines with caller filters through
  logical `AND`. V1 exposes no generic bypass or replacement flag.
- The filter applies to relation handle reads, eager relation inclusions,
  transport relation projections and connections, and the visible universe of
  `some`, `none`, `every`, `count`, `isEmpty`, and `isNotEmpty`.
- Nested relation traversals resolve the corresponding field filter under the
  fixed eight-level depth and 64-occurrence relation-predicate budgets. Caller,
  declaration, and policy-owned predicates share that one operation-local
  complexity count. Cyclic expansion must fail deterministically instead of
  recursing without limit.
- Relation membership commands and nested writes keep physical membership
  semantics. `connect`, `disconnect`, `set`, and `clear` do not inherit this
  read-shaping filter.
- Source relation-field policy runs independently. Target Access, ACL, and
  protected constraints remain monotonic and cannot be weakened by the filter.
- Master does not bypass relation shaping. A contextual callback may explicitly
  branch on the request authority when the declaration intends that behavior.
- The callback remains private Runtime behavior. Static compilation and Typegen
  may describe its presence and types but never serialize executable code.
- JavaScript applications execute the same behavior without Typegen or a
  generated Runtime client.

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

- Core, adapters, and transports expose no Drizzle-specific relation option,
  executable relation resolver, request context, mutable Query shortcut, or
  generic bypass.
- Relation shaping cannot replace or weaken caller predicates, protected
  constraints, Access, ACL, or physical membership.
- Relation membership mutations and nested writes never inherit the read
  filter; eager mutation-result projections remain ordinary filtered reads.
- Contextual callbacks receive no source model or source fields, remain
  synchronous, and create no cross-request cache or per-parent execution.
- V1 has no asynchronous callback, source-dependent filter, schema-root default,
  public bypass, adapter-specific syntax, pointer filter, snapshot pagination,
  or keyset cursor.
- Public contracts contain no `any`, deep import, generated Runtime code,
  mutable builder, or new file-budget exception.

## Completion evidence

- Static and contextual declarations compile from the exact target schema while
  executable callbacks remain private, application-bound Runtime behavior.
  Direct relation handles, eager inclusions, predicates, cardinality, REST,
  networkless GraphQL, Yoga, and PostgreSQL share the same visible universe.
- Caller predicates, relation shaping, target Access, ACL, protected constraints,
  and physical membership compose monotonically. Master bypasses authorization
  but retains shaping unless the declaration explicitly branches on authority.
- Nested traversal retains the fixed depth of eight and now shares one fixed
  64-occurrence relation-predicate complexity budget across caller,
  declaration, and policy-owned expressions. Cycles and budget failures stop
  before adapter work.
- Physical connect, disconnect, set, clear, and nested-write behavior remains
  independent from read shaping. Pointer projection, REST offsets, GraphQL
  Relay cursors, mutation projections, grouped inclusions, and Typegen-free
  JavaScript retain their established contracts.
- The final gate passed 503 files with 2,357 ordinary tests, 586 files with
  2,633 coverage tests, 27 packed-consumer files with 156 tests, and 86 built
  E2E files with 346 tests. Coverage completed at 88.84% statements, 81.68%
  branches, 94.75% functions, and 89.38% lines. Every package passed `attw` and
  `publint`; constraints, issue metadata, formatting, TypeScript, lint, build,
  dependency, export, and removal audits also passed.

Milestone 27 is complete. Contextual relation filters are now part of the
first-release contract, while the exclusions above remain future work rather
than implicit extension points.
