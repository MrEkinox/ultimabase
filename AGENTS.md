# UltimaBase agent guide

This file is the operational contract for any coding agent working in this repository.

## Read first

Before changing code:

1. Read `README.md`, `ARCHITECTURE.md`, and the README of every package in scope.
2. Read `CURRENT_PLAN.md` when it exists; it records the active or explicitly
   paused multi-issue objective and its resume point.
3. Read the relevant ADRs under `docs/adr/`.
4. Pick one issue from `issues/` unless the user explicitly defines a narrower task.
5. Check the issue dependencies and do not silently implement blocked work.
6. Inspect the working tree and preserve unrelated user changes.

## Agent coordination

- Use sub-agents only when the task divides into independent workstreams that can make useful progress in parallel.
- Give each sub-agent a bounded, non-overlapping scope and avoid concurrent edits to the same files.
- Keep small changes, central architectural decisions, and tightly coupled implementation work with the primary agent.
- The primary agent owns integration, resolves inconsistencies, verifies the complete result, and remains accountable for every delivered change.

## Product rules

- UltimaBase is a modern TypeScript backend framework inspired by Parse Server DX, not a compatible clone.
- Developer TypeScript declarations plus authorized deterministic plugin
  contributions form the authoritative compiled application graph. Generated
  Typegen files are replaceable declarations, never Runtime truth.
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
- Master access is trusted server-side authority and must never be forgeable from transport input.

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
other official plugins -> plugin-kit/core/shared
```

Schema, Query, application orchestration, protected constraints, persistence
plans, and Runtime are internal Core domains rather than separate packages.
Their source folders preserve the same logical direction without creating
published-package cycles. `plugin-kit` is a public convenience layer for plugin
authors; Core must never import it. Official Hooks and Access contracts live in
their respective plugin packages; importing either package installs no
behavior. Independent behavior and policy engines own their contracts.

Key prohibitions:

- `core` must not import a concrete plugin or infrastructure library.
- `core` must not import `plugin-kit`, `hooks-plugin`, or `access-plugin`;
  those packages depend toward foundations.
- Core's Runtime domain must not import Drizzle, PostgreSQL, Hono, Yoga, or GraphQL.
- transport packages must not issue SQL or bypass the runtime.
- database-specific migration logic stays in a database-specific migration plugin.
- packages must import another package through its public export, never through `src/`.

Run or update `yarn constraints` when dependency constraints exist. If a requested change would violate the graph, stop and propose an ADR instead.

## Public API style

- Prefer classes for public domain objects and immutable builders: `Query`, `ACL`, `Role`, framework errors, and application objects.
- Every builder method returns a new instance. Never mutate a previous `Query` or `ACL`.
- Prefer arrow functions for stateless factories, hooks, scopes, permission rules, and utilities.
- Do not implement mutable Active Record, dirty tracking, or direct adapter persistence. Schema model instance commands accepted by ADR-0109 remain immutable and must delegate through Query and `RequestEngine`; `Role`, `ACL`, and other non-schema values do not gain persistence methods.
- Never use `any`, whether explicit, implicit, hidden behind an assertion, or exposed through a public API. Use `unknown` plus validation at untrusted boundaries.
- Type variables and boundaries as precisely as possible. Keep inference when it already produces a precise, verifiable type.
- Treat autocomplete and hover documentation as part of every public TypeScript API. Prefer named option interfaces, add English JSDoc with focused examples, and protect important editor behavior through TypeScript language-service tests against source and compiled package exports.
- Replacing a public API requires a removal audit in the same change: delete every superseded implementation and barrel export unless an accepted ADR explicitly preserves compatibility, then protect the canonical replacement with focused runtime or type tests.
- Every code contribution must include comments written in English. Explain intent, invariants, security boundaries, and non-obvious decisions rather than restating the implementation.
- Avoid code duplication whenever practical. Reuse focused functions, variables, types, and modules for shared behavior or invariants without abstracting coincidental similarities.
- Prefer a suitable standard, native, or established-library solution over custom code. Add code only when existing alternatives cannot correctly satisfy the requirement.
- Do not promise subclassing as an extension mechanism; prefer composition and plugins.

## Plugins

- Every publishable plugin package must end with `-plugin` in both its
  `packages/<name>-plugin` directory and its `@ultimabase/<name>-plugin` package
  name. Packages that are not plugins must not use this suffix.
- A plugin factory returns a static typed definition.
- A manifest declares structured plugin and optional instance identity,
  compatibility ranges, requested privileges with reasons, environmental
  claims, dependencies, capabilities, and explicit replacement intent.
- Every requested privilege from ADR-0191's closed vocabulary is validated and
  reported before any plugin static declaration, Typegen, setup, connection,
  Runtime, or transport effect.
- Privileges are denied globally, by plugin ID, or by exact instance. Unknown
  policy targets are configuration errors. The default console logger reports
  installed plugins, privileges, reasons, severity, and claims unless the
  developer explicitly replaces or silences that diagnostic sink.
- Environmental claims describe direct filesystem, network, process, and native
  behavior that in-process JavaScript cannot be forced to declare. Privileges
  and claims are inspectable policy, not an operating-system sandbox.
- Plugins declare versioned application-local capabilities and may provide,
  require, decorate, or explicitly replace them only with the matching
  privilege and deterministic conflict rules.
- Capability cardinality and composition are fixed: `single` has one provider,
  `multiple` has ordered independent providers, and `pipeline` has ordered
  handlers. Decoration and replacement follow ADR-0190 and never silently use
  last-writer-wins. Tokens declare `declaration` or `application` lifetime;
  resource-backed application values are materialized and disposed by Core.
- Nested plugins are configuration sugar over one global plugin graph.
- Plugin `peers` validate exact identity and semantic compatibility without
  adding declaration, lifecycle, materialization, or teardown order. Use a
  dependency whenever ordering is required.
- Parent setup precedes child setup; child teardown precedes parent teardown.
- Dependencies and configuration order determine deterministic plugin and hook ordering.
- Duplicate plugin IDs without explicit distinct instances are errors.
- Authorized plugins may contribute schemas, field kinds, namespaced options,
  immutable patches, model surfaces, operations, Typegen declarations, Runtime
  middleware, protected constraints, and persistence-plan rewrites. Static
  contributions remain pure, synchronous, deterministic, and infrastructure-free.
- Query extensions, Runtime observers, migration intent, and filesystem reads
  use their own exact privileges; broader neighboring privileges never imply
  them.
- `@ultimabase/plugin-kit` contains reusable authoring helpers only. Official
  plugins use it when suitable, and its helpers must not bypass ownership,
  privilege, validation, or provenance checks enforced by Core.
- Versioned capabilities are the only public cross-plugin integration host.
  Milestone 14 removes public string slots, service lookup, named setup
  registries, and generic contribution registries instead of preserving parallel
  escape hatches.
- Plugin-created schemas, operations, and application-specific model commands
  are reached through application-owned handles. Plugins never mutate an
  exported schema class or prototype.
- Typegen may consume the compiled graph and owner-scoped plugin contributions,
  but may emit only declarations and deterministic inert metadata. JavaScript
  applications execute the same graph without Typegen or a generated client.
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
→ initial structural validation
→ initial operation and mutation-field Access
→ load and lock the visible target when one may exist
→ item Access
→ field resolveInput
→ schema resolveInput with originalItem
→ target-aware preparedOperation transforms
→ structural revalidation without replaying defaults or generators
→ value-dependent Access re-evaluation
→ plugin/global before observers
→ schema before observers
→ database operation
→ schema after hooks
→ plugin/global after hooks
→ final monotonic output restrictions
→ beforeCommit
→ commit
→ afterCommit and post-commit events
```

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

## File size budgets

- Handwritten production TypeScript files warn above 400 lines and fail above
  600 lines.
- Handwritten test TypeScript files warn above 600 lines and fail above 750
  lines.
- Generated artifacts are excluded by repository path patterns rather than
  inline lint suppressions.
- Pre-existing oversized files are listed only in the centralized baseline in
  `tooling/eslint/file-line-budget.ts`. A baseline value must never increase.
  When a file shrinks, lower its baseline in the same change; remove the entry
  as soon as the file fits its hard limit.
- New files and files split by a maintenance issue receive no baseline
  exception. Do not add local disables for the line-budget rules.

## Testing requirements

- Use Vitest.
- Add runtime tests and compile-time type tests for every public generic API.
- PostgreSQL integration tests use Testcontainers and one PostgreSQL schema per worker.
- Applications must remain isolated so tests can run in parallel.
- Test builders for immutability.
- Test public package exports and prohibit deep imports.
- Test capability ownership, deterministic order, two explicit instances of one
  plugin, replacement and decoration conflicts, lifecycle cleanup, upgrades,
  orphaned contributions, and the absence of legacy registry bypasses.
- Every bug fix includes a regression test.

Before finishing an issue, run the narrowest relevant commands, then the broader checks justified by the change:

```text
yarn typecheck
yarn test
yarn lint
yarn build
```

Document anything that could not be run.

Create a dedicated commit after an issue is complete, but never push it without the user's explicit confirmation.

## Documentation and decisions

- Update the package README when its public contract changes.
- Every change under `packages/core/src/schema` must review the schema examples. Update
  `packages/core/examples/schema` in the same issue whenever field behavior, schema
  composition, inference, registry behavior, or validation plans change.
- Add or update an ADR for architectural decisions, dependency-boundary changes, storage formats, public API conventions, or security semantics.
- Keep issue status and acceptance criteria current.
- Do not rewrite an accepted ADR to hide history; supersede it with a new ADR.

## Scope discipline

- Implement the selected issue, its required tests, and necessary documentation.
- Do not create empty future packages as placeholders.
- Do not combine unrelated issues merely because they touch nearby files.
- Temporary compromises must be explicit in code comments, issue notes, or ADRs.

## Evidence-first implementation

- Implement only behavior required by the current issue acceptance criteria, a
  failing test, an existing documented contract, or the user's explicit request.
- Treat plausible future use cases as out of scope. Present them separately as
  proposals; do not add code, APIs, options, extension points, storage, or
  infrastructure for them without explicit approval.
- Prefer the smallest correct solution that reuses existing concepts and a
  suitable standard, native, or established-library capability.
- Introduce a shared abstraction only when it protects one current invariant or
  removes duplication across at least two current concrete usages. A
  hypothetical future consumer is not a second usage.
- Do not widen a public API or generalize an internal contract merely to keep
  future options open.
- Before an unapproved architectural change, summarize the proven need, the
  minimal solution, and what will deliberately not be anticipated. Then wait
  for user validation. An accepted ADR or explicit issue criterion already
  counts as approval.
- If implementation starts expanding beyond the selected issue, stop and ask
  for direction instead of silently absorbing the extra scope.
- In the issue handoff, identify any implementation that exceeds the original
  acceptance criteria and explain why it was necessary.
- A recent explicit user instruction such as `stop` overrides an older plan,
  autonomous objective, or automatic continuation until the user explicitly
  resumes it.
