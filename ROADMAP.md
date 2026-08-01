# Roadmap

The issue backlog is the executable roadmap. This document only describes milestone intent.

## Current execution priority

The access-free Runtime-to-PostgreSQL vertical is complete. Before starting
milestone 4 access plugins, implement the native schema and field hook lifecycle
described in [`CURRENT_PLAN.md`](CURRENT_PLAN.md). This establishes the typed
business lifecycle, automatic mutation transaction boundary, and plugin hook
targets that CLP, ACL, and field-permission plugins must compose around.

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
targets, cursor pagination, and master access.

## Milestone 4 — Access plugins

Roles and role hierarchy, CLP, object ACL, per-schema ACL tables, field access, SQL compilation, and audit events.

## Milestone 5 — PostgreSQL vertical

Drizzle-backed adapter, schema compilation, introspection, direct schema synchronization, PostgreSQL migrations, and Testcontainers.

## Milestone 6 — REST and GraphQL vertical

Hono server, generated REST endpoints, GraphQL schema generation, cursor connections, Yoga integration, custom schema merging, and developer explorers.

## Milestone 7+ — Optional ecosystem

Pointers, relations, object fields, authentication, realtime, jobs, cache, gRPC, OpenAPI, CLI, code generation, SDKs, audit, observability, soft delete, tenant isolation, advanced fields, health, and administration remain issue-tracked extensions. Their packages are created only when implementation begins.

## First usable release

The first release must support full primitive-field CRUD, bulk operations,
upserts, REST, GraphQL, PostgreSQL, cursor pagination, native typed hooks,
automatic mutation transactions, and parallel integration tests.
