# Roadmap

The issue backlog is the executable roadmap. This document only describes milestone intent.

## Current execution priority

The Runtime-to-PostgreSQL vertical, current native hook lifecycle, fundamental Access,
transport-neutral relations, developer-defined stored roles, persisted object
ACL, structured JSONB fields, and the schema-root Query and mutation API are
complete foundations. The
[pre-feature codebase consolidation plan](docs/plans/completed/pre-feature-codebase-consolidation.md)
has also completed its strict Schema and public API boundaries, empty-package
cleanup, and focused Query, schema-model, Runtime, and native Access splits
without adding a product capability. The
[Query execution and enforcement consolidation plan](docs/plans/completed/query-execution-and-enforcement-consolidation.md)
has likewise removed dead internal helpers and focused Query execution plus
policy-neutral Enforcement ownership without changing public behavior. The
[trusted open plugin kernel and optional official capabilities plan](CURRENT_PLAN.md)
is now active. Its trusted open kernel milestone passed the complete audit in
issue 1414; work resumes at issue 1501 to extract Hooks and Access into optional
official plugins.

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

## Milestone 3 — Query and runtime foundations

Operation AST, immutable `Query`, CRUD including bulk and upsert, RequestEngine,
automatic mutation transactions, the currently implemented schema and field
hook lifecycle, policy-neutral monotonic enforcement, cursor pagination, and
Core master access. Milestone 15 preserves the accepted behavior while moving
the optional Hooks product out of Core.

## Milestone 4 — Access foundations and persisted policy providers

Native operation, filter, item, and field Access; compiled provider
contributions; developer-defined stored roles and role hierarchy; object ACL;
indexed PostgreSQL JSONB storage; SQL compilation; and audit events.
Milestone 15 migrates the optional Access product and providers onto the open
kernel while Core retains only generic protected constraints and master
authority.

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

## Milestone 14 — Trusted open plugin kernel

Declared privileges and visible startup policy, explicit plugin instances,
versioned declaration and application capabilities, removal of legacy public
slots/services/registries, plugin-owned static schema transformation and
upgrades, dynamic schemas and operation handles, explicit transport and adapter
bridges, Typegen participation, Runtime middleware, rewritable persistence
plans, and public plugin authoring plus conformance toolboxes. Official and
community plugins use the same contracts. JavaScript applications continue to
run without Typegen or a generated client.

## Milestone 15 — Optional Hooks and Access plugins

Extract the existing Hooks and Access products into contract-only protocol
packages plus official `@ultimabase/hooks-plugin` and
`@ultimabase/access-plugin` implementations, migrate ACL and policy
integrations, and prove that applications can run without either system or
install community alternatives. Core keeps anonymous and audited master
authority.

## First usable release

The first release must support full primitive-field CRUD, bulk operations,
upserts, REST, GraphQL, PostgreSQL, cursor pagination, optional official typed
Hooks and Access plugins, automatic mutation transactions, and parallel
integration tests.
