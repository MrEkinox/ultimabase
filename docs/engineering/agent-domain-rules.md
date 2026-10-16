# Domain-specific agent rules

These are mandatory instructions for changes in the corresponding domain, not
optional background. Read the relevant sections in full before editing; do not
load unrelated sections or all historical ADRs. The [architecture index](../current-architecture.md)
routes to maintained contracts and conformance tests. [Root AGENTS](../../AGENTS.md)
always applies. Contracts and accepted ADRs override stale historical wording.

## Removed extension and migration powers

Milestone 30's accepted ADR-0258 and ADR-0259 define the approved migration
target. ADR-0258 permits one initialized application per JavaScript realm and
isolated parallel workers. ADR-0259 removes exactly R-001–R-010, preserves used
plugin behavior and internal performance measurements, and keeps one private
command graph with application operations and schema mutations. Issues
3004/3005 remove generic decoration/replacement, compiler/Runtime substitution,
the Core observer protocol, Query extensions, destructive patches, arbitrary
schema/model operations, and manual Typegen declarations/extra outputs (Typegen
itself was later removed, ADR-0297).
Their used product counterparts remain intact. Do not add substitute public
APIs or remove another capability without following the architecture stop rule.

Milestone 31's accepted ADR-0266 removes only migration support, upgrade intent,
planning/history helpers and PostgreSQL preparation claims. Physical metadata,
all owner/version/options/payload snapshot fields, direct synchronization and
`renamedFrom`, private storage and transaction-bound raw access remain. No
migration privilege or replacement protocol exists; future migrations require
an explicit architecture decision before implementation.

ADR-0289 (pre-release simplification) removes kernel extension points that only
tests consumed: the `restrictInput`/`restrictSelection`/`restrictOutput`/
`constraint` enforcement factories, Core's `beforeOperation`/`afterOperation`
interceptor factories, `contributeSchemaMutationBinding`, the adapter support
tokens, physical-schema contributions and raw adapter leases with the
`adapter:raw` privilege, the protected-policy `constraints` effect with
`databaseConstraint`, adapter constraint compilers and the `adapter:consume`
privilege, and portable schema constraints (`defineSchemaConstraint`,
`addSchemaConstraint`, plugin-kit `schemaPatch().addConstraint()`). Protected
policies (row filters and field narrowing), guards, prepared operations,
Runtime behaviors, persistence rewrites, private storage and direct
synchronization remain. Restoring a removed point requires a real
consumer and a new ADR.

## Product rules

- UltimaBase is a modern TypeScript backend framework inspired by Parse Server DX, not a compatible clone.
- Developer TypeScript declarations plus authorized deterministic plugin
  contributions form the authoritative compiled application graph. Editor types
  come from the declarations without a generation step (ADR-0297).
- The developer never writes Drizzle directly.
- Concrete capabilities are plugins. The Core must not depend on PostgreSQL, Drizzle, Hono, GraphQL, Yoga, authentication providers, Redis, or job systems.
- Plugin identity is structured as a stable plugin ID plus an optional explicit
  instance ID. Multiple configurations of one plugin are legal only when their
  instance identities and capability contracts make composition unambiguous.
- REST and GraphQL normalize into the same operation/query AST and execute through the same runtime pipeline.
- ADR-0189 is delivered: Hooks and Access are optional official plugins built
  on the same public kernel as community alternatives. Do not reintroduce
  Core-specific Hooks or Access extension paths.
- ACL contributes its independent monotonic policy through Core's generic
  protected constraint capability and never depends on the official Access
  package. Roles and authentication provide optional request subjects but grant
  nothing by themselves. Core Runtime must not name, configure, bypass, or
  install neutral stages for concrete providers.
- Core authority modes are `anonymous` and `master`. Authentication, user identity, sessions, and user schemas belong to optional plugins; there is no `user` or `system` Core mode.
- Master access is trusted server-side authority that bypasses authorization
  policies while retaining validation, hooks, transactions, database
  constraints, and integrity maintenance. It must never be forgeable from
  transport input.

## Dependency direction

Dependencies point toward foundations. In the diagram, `A -> B` means that A may import B:

```text
core -> shared
plugin-kit -> core/shared
hooks-plugin -> plugin-kit/core/shared
official Hooks extensions -> hooks-plugin/plugin-kit/core/shared
access-plugin -> plugin-kit/core/shared
official Access providers -> access-plugin/plugin-kit/core/shared
ACL providers -> plugin-kit/core/shared
soft-delete-plugin -> plugin-kit/core/shared
other official plugins -> plugin-kit/core/shared
http-plugin -> plugin-kit/core/shared
hono-server-plugin -> http-plugin/plugin-kit/core/shared
rest-plugin -> http-plugin/plugin-kit/core/shared
auth-plugin -> http-plugin/plugin-kit/core/shared
auth-password -> auth-plugin/plugin-kit/core/shared
graphql-plugin -> plugin-kit/core/shared
graphql-http -> core/shared
graphql-yoga-plugin -> graphql-http/http-plugin/graphql-plugin/plugin-kit/core/shared
graphql-explorer-plugin -> graphql-http/http-plugin/plugin-kit/core
api-server -> http-plugin/rest-plugin/graphql-plugin/graphql-yoga-plugin/graphql-explorer-plugin/hono-server-plugin
```

Schema, Query, application orchestration, protected constraints, persistence
plans, and Runtime are internal Core domains rather than separate packages.
Their source folders preserve the same logical direction without creating
published-package cycles. `plugin-kit` is a public convenience layer for plugin
authors; Core must never import it. Official Hooks and Access contracts live in
their respective plugin packages; importing either package installs no
behavior. Independent behavior and policy engines own their contracts.

An application has one Core instance, so every published package that uses
Core, directly or through another package (`api-server` only forwards it),
declares `@ultimabase/core` as a peer with a matching development dependency,
never as a dependency; applications and examples list Core themselves.
`yarn constraints` enforces both.

Key prohibitions:

- `core` must not import a concrete plugin or infrastructure library.
- `core` must not import `plugin-kit`, `hooks-plugin`, or `access-plugin`;
  those packages depend toward foundations.
- Core's Runtime domain must not import Drizzle, PostgreSQL, Hono, Yoga, or GraphQL.
- transport packages must not issue SQL or bypass the runtime.
- REST and GraphQL are sibling transports. GraphQL Core remains
  network-independent; Yoga, REST, Hono, and HTTP authentication integrations
  meet only through the optional official HTTP plugin.
- Transports enter Runtime only through Core's narrow versioned application
  request execution capability. They never receive a `FrameworkEngine`,
  `RequestEngine`, `FrameworkApplication`, `UltimaBase`, adapter, pipeline,
  authority, grant, or lifecycle mutation facade.
- Every public HTTP application request identifies the sole active
  application. Explicitly configured infrastructure-only browser preflight is
  the sole exception and invokes no application behavior. An explicitly
  enabled raw Master key is verified and audited only by that application's
  Core authority; headers, flags, shaped contexts, grants, and foreign
  credentials never manufacture authority.
- Browser-origin policy is disabled by default. The sole active application
  owns one effective policy; preflight invokes no application behavior.
  Server providers retain one optional HTTP owner and use the safe HTTP
  dispatch boundary after shutdown, without shared-server application maps.
- Application-identity and credential failures before route dispatch use the
  HTTP plugin's protocol-neutral safe error boundary. REST and GraphQL own
  errors only after their selected handler begins.
- database-specific migration logic stays in a database-specific migration plugin.
- packages must import another package through its public export, never through `src/`.

Run `yarn constraints`; update the graph in `yarn.config.cjs` and `ARCHITECTURE.md` together. If a requested change would violate the graph, stop and propose an ADR instead.

## Plugins

- Every publishable plugin package must end with `-plugin` in both its
  `packages/<name>-plugin` directory and its `@ultimabase/<name>-plugin` package
  name. Packages that are not plugins must not use this suffix.
- A plugin factory returns a static typed definition.
- A manifest declares structured plugin and optional instance identity,
  compatibility ranges, privileges derived from contributions with author or
  generated reasons, environmental claims, dependencies, and capabilities.
  Only the critical `authority:elevate` and `storage:private` privileges
  require an explicit author reason (ADR-0290).
- Every requested privilege from ADR-0191's closed vocabulary is validated and
  reported before any plugin static declaration, setup, connection,
  Runtime, or transport effect.
- Privileges are denied globally, by plugin ID, or by exact instance. Unknown
  policy targets are configuration errors. The application logger
  (ADR-0313) reports installed plugins, privileges, reasons, severity, and
  claims at `debug`, one startup summary line at `info`, and denials at
  `error`; `logger: false` silences every line.
- Environmental claims describe direct filesystem, network, process, and native
  behavior that in-process JavaScript cannot be forced to declare. Privileges
  and claims are inspectable policy, not an operating-system sandbox.
- Plugins declare versioned application-local capabilities and may provide,
  require, or optionally consume them only with the matching privilege and
  deterministic conflict rules.
- Capability cardinality and composition are fixed: `single` has one provider,
  `multiple` has ordered independent providers, and `pipeline` has ordered
  handlers. ADR-0259 removes generic decoration and replacement; competing
  single providers remain errors. Tokens declare `declaration` or `application` lifetime;
  resource-backed application values are materialized and disposed by Core.
- Plugins are installed through `UltimaBase.use(...plugins)` or chained `.use()`
  calls, producing one flat application plugin graph. Use explicit
  dependencies, peers, or capabilities for relationships; plugin definitions do
  not contain nested plugins.
- Plugin `peers` validate exact identity and semantic compatibility without
  adding declaration, lifecycle, materialization, or teardown order. Use a
  dependency whenever ordering is required.
- Parent setup precedes child setup; child teardown precedes parent teardown.
- Dependencies and configuration order determine deterministic plugin and hook ordering.
- Duplicate plugin IDs without explicit distinct instances are errors.
- Authorized plugins may contribute schemas, field kinds, namespaced options,
  immutable patches, schema surfaces, operations, Runtime
  middleware, protected constraints, and persistence-plan rewrites. Static
  contributions remain pure, synchronous, deterministic, and infrastructure-free.
- Product-owned Runtime observation and filesystem claims
  retain their exact privilege or claim boundaries; broader neighboring powers
  never imply them. Query extension registrars and destructive schema patches
  are removed. Plugins type their contributions through Core's projection
  slots (ADR-0316); they cannot append declarations or output files.
- `@ultimabase/plugin-kit` contains reusable authoring helpers only. Official
  plugins use it when suitable, and its helpers must not bypass ownership,
  privilege, validation, or provenance checks enforced by Core.
- Versioned capabilities are the only public cross-plugin integration host.
  Milestone 14 removes public string slots, service lookup, named setup
  registries, and generic contribution registries instead of preserving parallel
  escape hatches.
- Plugin-created schemas, operations, and application-specific schema commands
  are reached through application-owned handles. A plugin may claim exact
  ownership of a developer schema already listed at the application root, but
  plugins never mutate an exported schema class or prototype.
- JavaScript applications execute the same compiled graph without a generated
  client.
- Hooks and Access are optional official plugins. Their ordering, typing,
  transactional, and monotonic security semantics remain requirements, while
  community alternatives may expose a different developer experience through
  the same public kernel.
- Policy capabilities use generic deny-only guards, AND-only row filters,
  append-only adapter constraints, narrowing field restrictions, and
  Core-validated structural output subsets. Later middleware must never broaden
  accumulated enforcement. ACL targets this generic boundary directly and does
  not depend on access-plugin.

## Runtime order

Preserve this logical pipeline through the public capability kernel and the
optional official engines:

```text
normalization
→ initial Core structural validation without application validators
→ initial operation and mutation-field Access
→ load and lock the visible target when one may exist
→ item Access
→ field resolveInput
→ schema resolveInput with originalItem
→ target-aware preparedOperation transforms
→ mandatory Core structural validation without replaying defaults or generators
→ optional final mutation validation (issues merged with Core's, outputs revalidated)
→ optional rejection-only final mutation-input guards
→ value-dependent Access re-evaluation
→ plugin/global before observers
→ schema before observers
→ database operation
→ schema after hooks
→ plugin/global after hooks
→ final monotonic output restrictions
→ beforeCommit
→ commit
→ after-commit work (Hooks afterCommit and events), outside the transaction,
  not awaited by the response, failures logged (ADR-0318)
```

The optional Validation plugin runs Standard Schema field validators only through
the final mutation-input guard. Result, materialization, inclusion, and read
boundaries repeat Core structural snapshots without application validation.
Numeric deltas validate their complete projected value from prepared locked
targets and remain atomic adapter operations; a targetless validated arithmetic
branch fails before persistence.

Keep the logical operation separate from its physical persistence plan. A
privileged plugin may rewrite the physical plan, but logical Access, hooks,
audit, result, and relationship semantics still observe the original operation.
Protected constraints never enter the replaceable plan and can only narrow.

Every mutation and its hook-started database work use one automatic transaction;
reads do not unless the developer opens one explicitly. Hooks are ordered by
plugin dependencies, then plugin position, then registration order. Business
after-hooks run before commit and may abort the transaction. Realtime and
asynchronous audit delivery happen after commit. Do not add a general
`skipHooks` escape hatch. Generated-schema collection mutations are ordered
itemized singular operations; do not reintroduce public set-based or
partial-success variants without an ADR. Low-level set-based adapter operations
must not manufacture item hooks implicitly.
Do not add permission-specific stage names or neutral permission handlers to
Runtime; an absent policy plugin contributes nothing.

## Retained typing boundaries

Source types own every typing contract (ADR-0297): relation thunks, projection
slots and the `Register` declaration. Do not add a parallel registry, a
generation step, or revive the removed `SchemaReference` bridge. Read the [retained boundary and failed proofs](../current-architecture.md#retained-typing-boundaries)
before changing schema inference, callback context, generated output, or editor DX.
A new proof must include actual source and packed consumers, cross-file relations,
exact diagnostics and readable hovers, not only a synthetic benchmark. Previously
rejected approaches require new evidence and explicit approval before reopening.
