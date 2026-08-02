# UltimaBase agent guide

This file is the operational contract for any coding agent working in this repository.

## Read first

Before changing code:

1. Read `README.md`, `ARCHITECTURE.md`, and the README of every package in scope.
2. Read `CURRENT_PLAN.md` when it exists; it records the active multi-issue objective and resume point.
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
- Static TypeScript schema declarations are the source of truth.
- The developer never writes Drizzle directly.
- Concrete capabilities are plugins. The Core must not depend on PostgreSQL, Drizzle, Hono, GraphQL, Yoga, authentication providers, Redis, or job systems.
- REST and GraphQL normalize into the same operation/query AST and execute through the same runtime pipeline.
- CLP controls class operations. ACL controls individual objects. Field permissions control field selection and mutation.
- CLP, ACL, roles, and field permissions are optional plugins that contribute through native hooks. Runtime must not name, configure, bypass, or install neutral stages for them.
- Access modes are `anonymous`, `user`, and `master`. There is no `system` mode.
- Master access is trusted server-side authority and must never be forgeable from transport input.

## Dependency direction

Dependencies point toward foundations. In the diagram, `A -> B` means that A may import B:

```text
core -> shared
official plugins -> core/shared
```

Schema, Query, Access, application orchestration, and Runtime are internal Core
domains rather than separate packages. Their source folders preserve the same
logical direction without creating published-package cycles.

Key prohibitions:

- `core` must not import a concrete plugin or infrastructure library.
- Core's Runtime domain must not import Drizzle, PostgreSQL, Hono, Yoga, or GraphQL.
- transport packages must not issue SQL or bypass the runtime.
- database-specific migration logic stays in a database-specific migration plugin.
- packages must import another package through its public export, never through `src/`.

Run or update `yarn constraints` when dependency constraints exist. If a requested change would violate the graph, stop and propose an ADR instead.

## Public API style

- Prefer classes for public domain objects and immutable builders: `Query`, `ACL`, `Role`, framework errors, and application objects.
- Every builder method returns a new instance. Never mutate a previous `Query` or `ACL`.
- Prefer arrow functions for stateless factories, hooks, scopes, permission rules, and utilities.
- Do not implement Active Record APIs such as `role.save()`. Persistence always passes through a `RequestEngine`.
- Never use `any`, whether explicit, implicit, hidden behind an assertion, or exposed through a public API. Use `unknown` plus validation at untrusted boundaries.
- Type variables and boundaries as precisely as possible. Keep inference when it already produces a precise, verifiable type.
- Treat autocomplete and hover documentation as part of every public TypeScript API. Prefer named option interfaces, add English JSDoc with focused examples, and protect important editor behavior through TypeScript language-service tests against source and compiled package exports.
- Every code contribution must include comments written in English. Explain intent, invariants, security boundaries, and non-obvious decisions rather than restating the implementation.
- Avoid code duplication whenever practical. Reuse focused functions, variables, types, and modules for shared behavior or invariants without abstracting coincidental similarities.
- Prefer a suitable standard, native, or established-library solution over custom code. Add code only when existing alternatives cannot correctly satisfy the requirement.
- Do not promise subclassing as an extension mechanism; prefer composition and plugins.

## Plugins

- A plugin factory returns a static typed definition.
- Nested plugins are configuration sugar over one global plugin graph.
- Parent setup precedes child setup; child teardown precedes parent teardown.
- Dependencies and configuration order determine deterministic plugin and hook ordering.
- Duplicate plugins with conflicting options are errors unless a future ADR introduces explicit instances.
- Schema and field plugins contribute typed extensions. Core's Schema domain must not know concrete ACL, CLP, role, or field-permission configuration.
- Hooks are a native framework capability, not a plugin or schema extension. Plugins append hook contributions through the application dispatcher; they never replace developer hooks.
- Policy plugins use generic deny-only guards, append-only adapter constraints, and narrowing field restrictions. Later hooks must never broaden accumulated enforcement.

## Runtime order

Preserve this pipeline unless an ADR changes it:

```text
normalization
→ structural validation
→ field resolveInput
→ schema resolveInput
→ structural revalidation
→ field validation hooks
→ schema validation hooks
→ monotonic guards, adapter constraints, and input or selection restrictions
→ plugin/global before hooks
→ schema before hooks
→ affected field before hooks
→ database operation
→ affected field after hooks
→ schema after hooks
→ plugin/global after hooks
→ final monotonic output restrictions
→ beforeCommit
→ commit
→ afterCommit and post-commit events
```

Every mutation and its hook-started database work use one automatic transaction;
reads do not unless the developer opens one explicitly. Hooks are ordered by
plugin dependencies, then plugin position, then registration order. Business
after-hooks run before commit and may abort the transaction. Realtime and
asynchronous audit delivery happen after commit. Do not add a general
`skipHooks` escape hatch or materialize set-based updates/deletes for item hooks.
Do not add permission-specific stage names or neutral permission handlers to
Runtime; an absent policy plugin contributes nothing.

## Testing requirements

- Use Vitest.
- Add runtime tests and compile-time type tests for every public generic API.
- PostgreSQL integration tests use Testcontainers and one PostgreSQL schema per worker.
- Applications must remain isolated so tests can run in parallel.
- Test builders for immutability.
- Test public package exports and prohibit deep imports.
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
