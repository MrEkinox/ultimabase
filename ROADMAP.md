# Roadmap

The issue backlog is the executable roadmap. This document only describes milestone intent.

## Current execution priority

The Runtime-to-PostgreSQL vertical, native hook lifecycle, fundamental Access,
transport-neutral relations, developer-defined stored roles, persisted object
ACL, structured JSONB fields, and the schema-root Query and mutation API are
complete foundations. The
[pre-feature codebase consolidation plan](docs/plans/completed/pre-feature-codebase-consolidation.md)
has also completed its strict Schema and public API boundaries, empty-package
cleanup, and focused Query, schema-model, Runtime, and native Access splits
without adding a product capability. The active
[Query execution and enforcement consolidation plan](CURRENT_PLAN.md) now
removes verified dead Query execution helpers, separates framework-owned
execution state from the immutable public Query builder, and focuses the
policy-neutral Enforcement dispatcher without changing public behavior.

The ACL hardening plan remains paused at issue 432. Generated schema authoring
and type contracts remain paused at the final DX and performance verification
issue 810. Neither paused objective is part of the active maintenance milestone.

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
The migration package remains planned and gains a workspace only when issue 513
starts implementation.

## Milestone 6 — REST and GraphQL vertical

Hono server, generated REST endpoints, GraphQL schema generation, cursor connections, Yoga integration, custom schema merging, and developer explorers.
These transport packages remain planned and gain workspaces only when their
implementation issues start.

## Milestone 7+ — Optional ecosystem

Pointers, relations, and JSONB-backed object fields are complete
transport-neutral foundations. Authentication, realtime, jobs, cache, gRPC,
OpenAPI, CLI, code generation, SDKs, audit, observability, soft delete, tenant
isolation, advanced fields, health, and administration remain issue-tracked
extensions. New
packages are created only when implementation begins.

## Milestone 8 — Generated schema authoring and developer tooling

Deferred schema field compilation, plugin-contributed FieldBuilder methods,
Nexus-style declarations, compact generated application contracts, deterministic
typegen commands, watch mode, startup regeneration, and measured TypeScript
editor performance. [ADR-0173](docs/adr/0173-generated-schema-authoring.md)
governs this milestone. It changes developer tooling without moving plugin,
database, transport, or runtime responsibilities into Core.

## Milestone 12 — Pre-feature codebase consolidation

Repository truth, strict built-in field declarations, reserved-name parity,
actionable field diagnostics, direct pre-release alias removal, and focused
internal Query, schema-model, Runtime, and native Access responsibility splits.
This milestone adds no product capability and leaves ACL hardening and Typegen
performance verification paused.

## Milestone 13 — Query execution and enforcement consolidation

Verified dead internal Query mutation helpers, separation of immutable Query
authoring from framework-owned scopes and execution, and focused internal
ownership for monotonic Enforcement contribution, relation, input, selection,
and output behavior. This milestone adds no public API or product capability.

## First usable release

The first release must support full primitive-field CRUD, bulk operations,
upserts, REST, GraphQL, PostgreSQL, cursor pagination, native typed hooks,
automatic mutation transactions, and parallel integration tests.
