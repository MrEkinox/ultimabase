# Active plan: contextual relation filters

- Status: active
- Milestone: 27
- Started: 2026-09-11
- Governing decision: [ADR-0247](docs/adr/0247-contextual-relation-filters.md)
- Resume point: issue 2702

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
2. [ ] Issue 2702 — declare the exact typed relation `where` API.
3. [ ] Issue 2703 — resolve contextual filters for direct relation reads.
4. [ ] Issue 2704 — apply filters to eager relation inclusions.
5. [ ] Issue 2705 — compose filters into relation predicates and cardinality.
6. [ ] Issue 2706 — prove public transport and PostgreSQL parity.
7. [ ] Issue 2707 — audit and close the milestone.

The authoritative acceptance criteria and dependency graph live in
[`issues/2700-contextual-relation-filters/`](issues/2700-contextual-relation-filters/README.md).

## Approved planning constraints

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
  existing bounded Query depth and complexity rules. Cyclic expansion must fail
  deterministically instead of recursing without limit.
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

- Issue 2701 must accept ADR-0247 before any public field, Query, Runtime,
  adapter, or transport contract changes.
- Stop if the implementation requires Core to import Drizzle, PostgreSQL, REST,
  GraphQL, Access, Hooks, or another concrete plugin.
- Stop if the relation filter could replace or weaken caller predicates,
  protected constraints, Access, ACL, or physical membership.
- Stop before applying the filter to relation membership mutations or nested
  writes; that would change write semantics and requires a separate decision.
- Stop before passing the source model or source fields to the callback; doing
  so changes collection batching and can introduce N+1 execution.
- Stop before asynchronous callbacks, schema-root defaults, a public bypass,
  adapter-specific filter syntax, or implicit cross-request caching.
- Stop if the exact public API requires `any`, deep imports, generated Runtime
  code, mutable builders, or a file-budget exception.

## Completion gate

The plan closes only after source and generated TypeScript, Typegen-free
JavaScript, packed packages, direct relation handles, nested eager inclusion,
relation predicates and cardinality, REST, networkless GraphQL, Yoga, and
PostgreSQL Testcontainers prove the same static and contextual semantics. The
final issue runs the complete repository validation sequence, reconciles
documentation and examples, archives this plan, and marks milestone 27
completed.
