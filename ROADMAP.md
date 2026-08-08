# Roadmap

The issue backlog is the executable roadmap. This document only describes milestone intent.

## Current execution priority

The Runtime-to-PostgreSQL vertical, native hook lifecycle, fundamental Access,
transport-neutral relations, developer-defined stored roles, persisted object
ACL, structured JSONB fields, and the schema-root Query and mutation API are
complete foundations. No multi-issue objective is currently active. The
[paused ACL hardening plan](CURRENT_PLAN.md) retains its exact resume point at
issue 432 until the user explicitly reactivates it.

Completed cross-milestone plans are retained under
[`docs/plans/completed/`](docs/plans/completed/) so their decisions remain
available without competing with the active resume point.

Milestone numbers continue to describe architectural ownership rather than a
strict implementation sequence.

## Milestone 0 — Repository foundations

Toolchain, package boundaries, CI, public export validation, release workflow, and contribution documentation.

## Milestone 1 — Static schemas

Primitive fields, schema registry, system fields, defaults, naming, typed schema extensions, and TypeScript inference.

## Milestone 2 — Application and plugins

Service tokens, plugin graph, nested plugins, lifecycle, isolated applications, typed errors, and deterministic ordering.

## Milestone 3 — Query and runtime

Operation AST, immutable `Query`, CRUD including bulk and upsert, RequestEngine,
automatic mutation transactions, native schema and field hooks, plugin hook
targets, policy-neutral monotonic enforcement, cursor pagination, and master
access.

## Milestone 4 — Fundamental Access and persisted policy providers

Native operation, filter, item, and field Access; compiled provider
contributions; developer-defined stored roles and role hierarchy; object ACL;
indexed PostgreSQL JSONB storage; SQL compilation; and audit events.

## Milestone 5 — PostgreSQL vertical

Drizzle-backed adapter, schema compilation, introspection, direct schema synchronization, PostgreSQL migrations, and Testcontainers.

## Milestone 6 — REST and GraphQL vertical

Hono server, generated REST endpoints, GraphQL schema generation, cursor connections, Yoga integration, custom schema merging, and developer explorers.

## Milestone 7+ — Optional ecosystem

Pointers, relations, and JSONB-backed object fields are complete
transport-neutral foundations. Authentication, realtime, jobs, cache, gRPC,
OpenAPI, CLI, code generation, SDKs, audit, observability, soft delete, tenant
isolation, advanced fields, health, and administration remain issue-tracked
extensions. New
packages are created only when implementation begins.

## First usable release

The first release must support full primitive-field CRUD, bulk operations,
upserts, REST, GraphQL, PostgreSQL, cursor pagination, native typed hooks,
automatic mutation transactions, and parallel integration tests.
