# Milestone 4 — Fundamental Access and permission providers

Access is a native Core lifecycle. Schemas and fields may declare policies
without installing a plugin, while CLP, ACL, field permissions, tenancy, soft
deletion, and community packages contribute policies through the same compiled
`AccessPlan`.

The four neutral levels are:

- `operation` for an early allow or deny decision;
- `filter` for database-enforced row restrictions;
- `item` for create input or one prepared mutation target;
- `field` for read, filter, order, create, and update decisions.

Access filters reuse the typed Core filter AST but remain separate from the
developer Query. They combine with Query and `beforeFind` predicates through
logical `AND` and cannot be inspected, replaced, or removed by business hooks.
Access executes before effectful business hooks, while final field restrictions
run after result transforms.

Runtime knows this generic lifecycle and its monotonic enforcement effects. It
never names CLP, ACL, roles, authenticated users, ownership, or field
permissions. Permission plugins register Access contributions rather than
installing arbitrary business hooks for enforcement.

Core authority remains limited to anonymous and audited master execution under
ADR-0113. Authenticated principals and roles are optional typed context or
service capabilities. Missing providers are valid until one configured policy
actually references the corresponding subject.

## Foundation execution order

1. [401 — Define native Access declarations](401-native-access-declarations.md)
2. [416 — Define typed Access filters](416-typed-access-filters.md)
3. [417 — Compile Access plans and plugin contributions](417-compiled-access-plans.md)
4. [418 — Execute the native Access lifecycle](418-native-access-runtime.md)
5. [419 — Verify native Access against PostgreSQL](419-native-access-postgres-e2e.md)
6. [420 — Define optional Access subject capabilities](420-optional-access-capabilities.md)

Concrete provider tracks may then proceed independently:

- CLP: issues 407 and 408;
- field permissions: issues 413 and 414;
- ACL: issues 409, 410, 510, 411, 509, and 412;
- provider composition: issue 415.

The official role provider remains deferred until pointer and relation issues
701 and 702 are complete. CLP and ACL are not blocked by that implementation:
they depend only on issue 420 and use compatible fixture providers in their
own role-aware tests.
