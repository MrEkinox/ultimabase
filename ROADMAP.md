# Roadmap

The issue backlog is the executable roadmap. This document only describes milestone intent.

## Current execution priority

The Runtime-to-PostgreSQL vertical, native hook lifecycle, fundamental Access,
transport-neutral relations, and developer-defined stored roles are complete.
The current priority is implementing persisted object ACL on top of native
Access and the completed neutral role-subject capability.

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
per-schema ACL tables; SQL compilation; and audit events.

## Milestone 5 — PostgreSQL vertical

Drizzle-backed adapter, schema compilation, introspection, direct schema synchronization, PostgreSQL migrations, and Testcontainers.

## Milestone 6 — REST and GraphQL vertical

Hono server, generated REST endpoints, GraphQL schema generation, cursor connections, Yoga integration, custom schema merging, and developer explorers.

## Milestone 7+ — Optional ecosystem

Pointers and relations are complete transport-neutral foundations. Object
fields, authentication, realtime, jobs, cache, gRPC, OpenAPI, CLI, code
generation, SDKs, audit, observability, soft delete, tenant isolation, advanced
fields, health, and administration remain issue-tracked extensions. New
packages are created only when implementation begins.

## First usable release

The first release must support full primitive-field CRUD, bulk operations,
upserts, REST, GraphQL, PostgreSQL, cursor pagination, native typed hooks,
automatic mutation transactions, and parallel integration tests.
