# Completed plan: first real PostgreSQL E2E vertical

- Status: complete
- Started: 2026-08-01
- Objective owner: project-wide
- Completed by: `issues/500-postgres/518-runtime-postgres-e2e.md`

## Objective

Deliver one real, access-free end-to-end path from a static UltimaBase schema to
a live PostgreSQL database before implementing roles, CLP, ACL, or field
permissions.

The finished path must exercise public package exports through:

```text
Schema
→ FrameworkApplication and plugins
→ assembled FrameworkEngine
→ RequestEngine and Query
→ Runtime validation and hooks
→ PostgreSQL adapter
→ live PostgreSQL rows
```

## Definition of done

The objective is complete only when a root E2E test:

- starts a real PostgreSQL Testcontainer;
- creates an isolated PostgreSQL schema for its Vitest worker;
- starts an application configured with `postgresPlugin`;
- derives database structures from the static schema without handwritten table DDL;
- creates, reads, filters, selects, updates, and deletes a row through a bound `Query`;
- verifies generated UUID v7, `createdAt`, and `updatedAt` values;
- disposes the application and PostgreSQL resources cleanly;
- imports only public built package exports;
- runs reliably through `yarn test:e2e` and the GitHub CI Docker runner.

Bulk operations, upserts, explicit transactions, access plugins, migrations,
REST, and GraphQL are not required for this first vertical.

## Frozen decisions

- Static schemas remain the source of truth; the E2E test must not create its application tables manually.
- Missing permission plugins install explicit neutral Runtime stages only when no permission extension requests them.
- PostgreSQL introspection is independent from ACL physical storage, which remains owned by issue 510.
- Runtime resolves the database adapter through Core's typed application service boundary, not a second adapter registry.
- Drizzle remains private to `@ultimabase/postgres-plugin`.
- The first E2E uses direct TypeScript queries. HTTP, REST, and GraphQL are later verticals.

## Execution order

Complete one issue at a time in this order and publish it only after user
approval. Do not start an issue whose dependencies are incomplete.

1. [x] [211 — Expose application service lookup](../../../issues/200-core/211-application-service-access.md)
2. [x] [323 — Assemble the application Runtime engine](../../../issues/300-query-runtime/323-application-runtime-assembly.md)
3. [x] [501 — Implement PostgreSQL connection lifecycle](../../../issues/500-postgres/501-pg-pool-plugin.md)
4. [x] [502 — Add the internal Drizzle adapter](../../../issues/500-postgres/502-drizzle-internal-adapter.md)
5. [x] [517 — Add PostgreSQL table naming](../../../issues/500-postgres/517-table-naming.md)
6. [x] [503 — Compile primitive schemas](../../../issues/500-postgres/503-primitive-schema-compilers.md)
7. [x] [504 — Compile indexes](../../../issues/500-postgres/504-index-compilers.md)
8. [x] [511 — Introspect PostgreSQL schema state](../../../issues/500-postgres/511-postgres-introspection.md)
9. [x] [512 — Apply direct schema policies](../../../issues/500-postgres/512-direct-schema-policy.md)
10. [x] [505 — Compile Query filters](../../../issues/500-postgres/505-query-filter-compiler.md)
11. [x] [506 — Compile selection, ordering, and pagination](../../../issues/500-postgres/506-selection-order-pagination.md)
12. [x] [507 — Implement singular PostgreSQL CRUD](../../../issues/500-postgres/507-crud-adapter.md)
13. [x] [516 — Add Testcontainers worker isolation](../../../issues/500-postgres/516-testcontainers-worker-isolation.md)
14. [x] [518 — Verify the first Runtime-to-PostgreSQL E2E](../../../issues/500-postgres/518-runtime-postgres-e2e.md)

Issues 505 and 506 are independent after their shared prerequisites and may be
reordered without changing the objective. The numbered list otherwise records
the preferred resume order.

## Resume protocol

When resuming after context loss:

1. Read `AGENTS.md` and this file completely.
2. Inspect `git status` and preserve unrelated changes.
3. Read the current issue, its package READMEs, and referenced ADRs.
4. Confirm the current issue's dependencies are `done`.
5. If the current issue is already `done`, move `Current issue` above to the first incomplete entry in the execution order.
6. Implement only that issue, including colocated runtime and type tests, documentation, and a Changeset.
7. Run targeted checks, then the broader checks justified by the change.
8. Show the implemented developer-facing API before asking whether to push.

Do not begin any file under `issues/400-access/` until issue 518 is done unless
the user explicitly changes this objective.

## Current developer experience

Issue 518 implements this public flow without manually constructing a
`RuntimePipeline` or writing SQL:

```ts
const application = await createApplication({
	schemas: [PostSchema],
	plugins: [
		postgresPlugin({
			url: databaseUrl,
			schemaPolicy: 'override',
		}),
	],
})

await application.start()

const framework = createFrameworkEngine(application)
const request = framework.anonymous({
	requestId: 'postgres-e2e',
	source: requestSources.internal,
})

const created = await request.query(PostSchema).create({
	title: 'First real E2E',
})

const rows = await request
	.query(PostSchema)
	.equalTo('id', created.id)
	.select({ id: true, title: true })
	.find()

await application.dispose()
```

This example is the implemented and Docker-verified DX for the plan.

## Progress log

Update this list after every completed issue so the next agent can resume
without reconstructing repository history.

- 211 — `done` — commit: `4d24000` — Read-only typed service lookup implemented.
- 323 — `done` — commit: `2635caa` — Application Runtime assembly implemented.
- 501 — `done` — commit: `68c466d` — Typed pool ownership and lifecycle implemented.
- 502 — `done` — commit: `4f72629` — Internal Drizzle adapter registered.
- 517 — `done` — commit: `96207e7` — PostgreSQL table naming implemented.
- 503 — `done` — commit: `8e14070` — Primitive fields and JSONB codecs compiled.
- 504 — `done` — commit: `3b621cb` — Deterministic ordinary and unique indexes compiled.
- 511 — `done` — commit: `35c83e7` — Deterministic live catalog snapshots implemented.
- 512 — `done` — commit: `749f558` — Transactional direct schema policies implemented.
- 505 — `done` — commit: `f8b65e4` — Parameterized primitive and logical filters compiled.
- 506 — `done` — commit: `9f70dbf` — Stable projections, ordering, offsets, and cursor predicates compiled.
- 507 — `done` — commit: `6bca47a` — Singular reads and mutations execute through private Drizzle queries.
- 516 — `done` — commit: `d53bd75` — One shared container feeds deterministic worker-isolated schemas.
- 518 — `done` — commits: `e923c6b`, `4f6f264` — Public singular CRUD and worker isolation pass GitHub CI run 148 against a live PostgreSQL Testcontainer.
