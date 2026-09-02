# Roadmap

The issue backlog is the executable roadmap. This document only describes milestone intent.

## Current execution priority

The Runtime-to-PostgreSQL vertical, official Hooks lifecycle, official Access,
transport-neutral relations, developer-defined stored roles, persisted object
ACL, structured JSONB fields, and the schema-root Query and mutation API are
complete foundations. The
[pre-feature codebase consolidation plan](docs/plans/completed/pre-feature-codebase-consolidation.md)
has also completed its strict Schema and public API boundaries, empty-package
cleanup, and focused Query, schema-model, Runtime, and enforcement splits
without adding a product capability. The
[Query execution and enforcement consolidation plan](docs/plans/completed/query-execution-and-enforcement-consolidation.md)
has likewise removed dead internal helpers and focused Query execution plus
policy-neutral Enforcement ownership without changing public behavior. The
[trusted open plugin kernel and optional official capabilities plan](docs/plans/completed/trusted-open-plugin-kernel-and-optional-official-capabilities.md)
is complete. Milestone 14 delivered the public kernel and milestone 15 proved
the optional official Hooks and Access plugins, independent alternatives, and
Core-owned Master through the final issue 1509 audit.

Milestone 16 completed the release-hardening backlog for those foundations. It
resolved the exact provenance and trust boundary of Master contexts, made
privilege and environmental reporting truthful, reconciled public
documentation, strengthened security coverage and conformance, trimmed
accidental public surfaces, and verified the no-product Runtime cost through
the final issue 1613 gate.

Milestones 20 and 21 completed the Standard Schema field contract and its
single-pass mutation semantics. Milestone 22 is the active target. It extracts
only the direct `validation` option and application validator into an optional
official plugin while Core retains required presence and every structural field
and Runtime invariant.

The ACL hardening plan remains paused at issue 432. Generated schema authoring
and type contracts remain paused at the final DX and performance verification
issue 810. Neither paused objective is part of an active plan.

Completed cross-milestone plans are retained under
[`docs/plans/completed/`](docs/plans/completed/) so their decisions remain
available without competing with the active resume point.

Milestone numbers continue to describe architectural ownership rather than a
strict implementation sequence.

## Milestone 0 — Repository foundations

Toolchain, package boundaries, CI, public export validation, release workflow, and contribution documentation.

## Milestone 1 — Static schemas

Primitive fields, schema registry, system fields, defaults, naming, plugin-owned
schema options, and TypeScript inference.

## Milestone 2 — Application and plugins

Service tokens, plugin graph, nested plugins, lifecycle, isolated applications, typed errors, and deterministic ordering.

## Milestone 3 — Query and runtime foundations

Operation AST, immutable `Query`, CRUD including bulk and upsert, RequestEngine,
automatic mutation transactions, generic Runtime behavior composition,
policy-neutral monotonic enforcement, cursor pagination, and Core master
access. The optional official Hooks plugin owns the schema and field lifecycle.

## Milestone 4 — Access foundations and persisted policy providers

The optional official Access plugin owns operation, filter, item, and field
policies plus compatible provider contributions. Developer-defined stored
roles, independent object ACL, indexed PostgreSQL JSONB storage, SQL
compilation, and audit events compose through public capabilities. Core retains
only generic protected constraints and master authority.

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
capabilities. New
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
internal Query, schema-model, Runtime, and former native Access responsibility
splits.
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

Completed extraction of Hooks and Access into the single vertical
`@ultimabase/hooks-plugin` and `@ultimabase/access-plugin` packages. Applications
run without either engine or with independent community alternatives; ACL
remains independent on Core's generic protected-policy boundary. Core keeps
anonymous and audited master authority.

## Milestone 16 — Kernel security and release hardening

Resolve the post-extraction security and release-readiness findings from
milestones 14 and 15. The milestone establishes an explicit Master context
provenance model before changing code, aligns every privilege and environmental
claim with an observable boundary, hardens Access and Hooks verification,
reconciles active documentation, and completes focused public-surface,
diagnostic, performance, and maintainability work without adding a new product
capability or package.

## Milestone 17 — Validation interoperability

Use established structural equality and validation protocols at two proven
boundaries: persisted adapter JSON snapshots and public plugin-option parsing.
The milestone adds no product capability, keeps JSON comparison internal to
Core, and lets Plugin Kit interoperate with Standard Schema without selecting a
validation library or making static plugin declarations asynchronous.

## Milestone 18 — Portable plugin containment and one ACL plugin

Let JSON-backed plugin fields opt into the existing structural containment
operator through a typed field-owned contract, then compile that Query AST
generically in PostgreSQL. ACL migrates authorization and subject-reference
discovery onto those protected row filters and removes its dedicated PostgreSQL
bridge, so applications install only `aclPlugin()` and their selected database
plugin without sacrificing adapter neutrality.

## Milestone 19 — Direct plugin schema configuration

Completed removal of generic schema and field `extensions`. Direct plugin
options own configuration, plugin fields own distinct logical values, ordinary
owner-attributed patches own structural changes, and versioned capabilities
own cross-plugin integration. No compatibility container or renamed metadata
bag remains.

## Milestone 20 — Standard Schema field validation

Completed the migration from nested `validation.required` to the direct
`required` field option, moved adapter-inspected decimal shape metadata to
direct options, and adopted one synchronous Standard Schema validator for the
complete canonical non-null field value. The validator may narrow through
issues but may not transform values,
perform asynchronous work, define field storage, or replace Core's structural
type snapshots. Built-in and plugin-defined fields share the same protocol
without selecting Zod, Valibot, ArkType, or another concrete library. Planned
email, phone, URL, slug, locale, numeric-bound, and similar validation-only
field extensions are retired in favor of composing native fields with Standard
Schema; explicit Hooks remain responsible for requested normalization.

## Milestone 21 — Single-pass field validation

Execute each field's Standard Schema application validator once on the final
mutation candidate after optional input resolution. Reads and result boundaries
retain Core structural snapshots without replaying application validators, so
tightening an input rule does not make existing persisted rows unreadable. The
complete result of an arithmetic update is projected from its locked target and
validated without replacing the adapter's atomic operation. The milestone
changes no field syntax, validator protocol, storage metadata, or plugin
boundary.

## Milestone 22 — Optional field validation plugin

Move the direct `validation` option, Standard Schema compatibility types,
application-local compiler, issue mapping, and final mutation execution into
`@ultimabase/validation-plugin`. Core keeps `required`, nullability, canonical
types and containers, defaults, generators, immutable and generated rules,
decimal shape, structural plans and snapshots, and Runtime orchestration.

The extraction first adds one generic rejection-only Runtime behavior boundary
after final structural mutation validation and before value-dependent
enforcement. Without `validationPlugin()` the option is absent from generated
types, untyped use fails application compilation, and Runtime installs no
application-validation behavior. With it installed, ADR-0221's exact-once,
read-free, atomic-arithmetic, and Master non-bypass semantics remain unchanged.

## First usable release

The first release must support full primitive-field CRUD, bulk operations,
upserts, REST, GraphQL, PostgreSQL, cursor pagination, optional official typed
Hooks and Access plugins, automatic mutation transactions, and parallel
integration tests.
