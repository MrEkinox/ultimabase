# Completed plan: fundamental Access system

- Status: completed
- Started: 2026-08-03
- Completed: 2026-08-03
- Objective owner: `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Governing decisions: [ADR-0090](../../adr/0090-permission-plugins-through-hooks.md), [ADR-0102](../../adr/0102-policy-neutral-monotonic-enforcement.md), [ADR-0103](../../adr/0103-versioned-adapter-constraint-compilers.md), [ADR-0113](../../adr/0113-plugin-owned-authentication-context.md), [ADR-0116](../../adr/0116-fundamental-access-system.md), [ADR-0117](../../adr/0117-optional-access-subject-capabilities.md)
- Previous completed objective: [Native hooks and contextual execution](native-hooks-and-contextual-execution.md)

## Objective

Make Access a fundamental schema, field, application, and Runtime capability
before implementing concrete permission providers. Native developer policies
and plugin contributions compile into the same monotonic plan without making
Core aware of CLP, ACL, roles, authenticated users, ownership, or field
permissions.

## Verified contract

- Schemas and fields expose precisely typed native Access declarations.
- Neutral helpers reduce repetitive declarations without adding policy concepts.
- Access filters reuse Core predicates while remaining private and monotonic.
- Application setup compiles native and plugin-contributed policies once.
- Operation, filter, item, and field policies execute before unsafe effects or disclosure.
- Set-based mutations never materialize rows silently for item decisions.
- Optional subject and role capabilities remain provider-owned and conditional.
- PostgreSQL E2E coverage proves SQL filtering, rollback, field restriction, master behavior, and non-existence semantics.
- Runtime and diagnostics contain no concrete permission-provider vocabulary.

## Frozen decisions

- Access is fundamental Core behavior; concrete permission systems are providers.
- Access has neutral `operation`, `filter`, `item`, and `field` levels.
- Access filters are private constraints that `beforeFind` cannot inspect or remove.
- Independent denials, row predicates, and field capabilities compose monotonically.
- Core authority remains anonymous or audited master; identity is plugin-owned.
- Every declaration or provider owns its master-bypass policy.
- Set-based update and delete remain set-based.
- Row denial behaves as non-existence, while invalid explicit capabilities fail clearly.

## Completed execution order

1. [401 — Define native Access declarations](../../../issues/400-access/401-native-access-declarations.md)
2. [421 — Group schema and field read Access](../../../issues/400-access/421-group-read-access.md)
3. [422 — Add Access declaration utilities](../../../issues/400-access/422-access-declaration-utilities.md)
4. [416 — Define typed Access filters](../../../issues/400-access/416-typed-access-filters.md)
5. [417 — Compile Access plans and plugin contributions](../../../issues/400-access/417-compiled-access-plans.md)
6. [418 — Execute the native Access lifecycle](../../../issues/400-access/418-native-access-runtime.md)
7. [419 — Verify native Access against PostgreSQL](../../../issues/400-access/419-native-access-postgres-e2e.md)
8. [420 — Define optional Access subject capabilities](../../../issues/400-access/420-optional-access-capabilities.md)

## Final state

- 401 — `done` — Native schema and field declarations normalize privately.
- 421 — `done` — Schema and field read families use concise or grouped rules.
- 422 — `done` — Neutral immutable helpers cover common declarations.
- 416 — `done` — Restricted typed filters reuse portable Query predicates.
- 417 — `done` — Application-local plans compile deterministic contributions.
- 418 — `done` — Runtime enforces every Access level monotonically.
- 419 — `done` — Live PostgreSQL proves the complete neutral lifecycle.
- 420 — `done` — Optional principals and role resolvers stay provider-owned.
