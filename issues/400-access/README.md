# Milestone 4 — Fundamental Access and persisted policy providers

Access is UltimaBase's only authorization lifecycle. Schemas and fields declare
their policies without installing a plugin. Parse-style CLP maps directly to
native schema Access, and field permissions map directly to native field
Access; neither concept needs a second configuration language or execution
plugin.

Optional packages extend this lifecycle only when they own additional data or
context. Roles resolve reusable subject membership, authentication supplies a
principal, and ACL persists per-object grants. Tenancy, soft deletion, and
community packages may contribute more monotonic policies through the same
compiled `AccessPlan`.

The four neutral levels are:

- `operation` for an early allow or deny decision;
- `filter` for database-enforced row restrictions;
- `item` for create input or one prepared mutation target;
- `field` for grouped item/filter/order disclosure plus create and update decisions.

Access filters reuse the typed Core filter AST but remain separate from the
developer Query. They combine with Query and `beforeFind` predicates through
logical `AND` and cannot be inspected, replaced, or removed by business hooks.
Access executes before effectful business hooks, while final field restrictions
run after result transforms.

Schema operation reads accept one shared rule or explicit `one`, `many`,
`count`, and `exists` branches. Field reads accept one shared rule or explicit
`item`, `filter`, and `order` disclosure branches. Mutation operation families
remain direct rules and retain their exact singular or bulk terminal in `kind`.
Neutral `allowAll`, `denyAll`, `allOperations`, and `allMutations` utilities
reduce repetitive declarations without installing callbacks or policy concepts.

Runtime knows this generic lifecycle and its monotonic enforcement effects. It
never names ACL, roles, authenticated users, ownership, tenants, or another
policy domain. Persisted policy providers register Access contributions rather
than installing arbitrary business hooks for enforcement.

Core authority remains limited to anonymous and audited master execution under
ADR-0113. Authenticated principals and roles are optional typed context or
service capabilities. Missing providers are valid until one configured policy
actually references the corresponding subject.

## Foundation execution order

1. [401 — Define native Access declarations](401-native-access-declarations.md)
2. [421 — Group schema and field read Access](421-group-read-access.md)
3. [422 — Add Access declaration utilities](422-access-declaration-utilities.md)
4. [416 — Define typed Access filters](416-typed-access-filters.md)
5. [417 — Compile Access plans and plugin contributions](417-compiled-access-plans.md)
6. [418 — Execute the native Access lifecycle](418-native-access-runtime.md)
7. [419 — Verify native Access against PostgreSQL](419-native-access-postgres-e2e.md)
8. [420 — Define optional Access subject capabilities](420-optional-access-capabilities.md)

## Remaining execution order

1. [408 — Align packages and documentation with native Access](408-native-access-package-alignment.md)
2. [407 — Add composable Access decision helpers](407-access-decision-combinators.md)
3. [402 — Implement Role class and internal schema](402-role-class-schema.md)
4. [403 — Implement direct role memberships](403-role-memberships.md)
5. [404 — Resolve nested roles and reject cycles](404-nested-role-resolution.md)
6. [405 — Resolve role references and deletion policies](405-role-references-deletion.md)
7. [406 — Implement rolesPlugin and role Access helpers](406-roles-plugin.md)
8. [409 — Implement immutable ACL class](409-acl-class.md)
9. [410 — Implement ACL schema extension](410-acl-schema-extension.md)
10. [411 — Implement aclPlugin](411-acl-plugin.md)
11. PostgreSQL ACL storage and compilation through issues 510 and 509
12. [412 — Add ACL hooks and events](412-acl-hooks-events.md)
13. [415 — Verify native Access and provider composition](415-access-plugin-composition.md)

Issues 407 and 408 previously described a separate CLP provider. Issues 413
and 414 previously described a separate field-permission provider. Those plans
were retired before implementation because issues 401, 421, 418, and 419
already provide the more general native behavior with a smaller public API.

The relations vertical ending at issue 747 is complete, so the official role
provider may now use the same pointer and relation primitives as application
schemas. ACL remains independently implementable against the neutral contracts
from issue 420 and must not import the official roles package.
