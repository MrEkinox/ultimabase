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

## Completed stored-role execution order

The completed stored-role objective is recorded in its
[archived plan](../../docs/plans/completed/developer-defined-stored-roles.md):

1. [402 — Define extensible role schemas](402-role-schema-definition.md)
2. [403 — Add typed role member commands](403-role-member-commands.md)
3. [404 — Resolve nested roles and reject cycles](404-nested-role-resolution.md)
4. [405 — Resolve role references and deletion policies](405-role-references-deletion.md)
5. [407 — Add composable Access decision helpers](407-access-decision-combinators.md)
6. [406 — Integrate stored roles with native Access](406-role-access-integration.md)
7. [423 — Verify the complete stored-role vertical](423-role-postgres-e2e.md)

## Completed persisted-object ACL execution order

The completed persisted-object ACL vertical is recorded in its
[archived plan](../../docs/plans/completed/persisted-object-acl.md):

1. [409 — Implement immutable ACL class](409-acl-class.md)
2. [424 — Add versioned ACL JSON serialization](424-acl-json-serialization.md)
3. [425 — Define the neutral current-principal resolver](425-current-principal-resolver.md)
4. [410 — Implement ACL schema extension](410-acl-schema-extension.md)
5. [411 — Implement aclPlugin](411-acl-plugin.md)
6. [428 — Enforce configurable ACL entry limits](428-acl-entry-limits.md)
7. PostgreSQL JSONB ACL storage and compilation through issues 510 and 509
8. [426 — Integrate ACL subject-reference cleanup](426-acl-reference-cleanup.md)
9. [412 — Add ACL hooks and events](412-acl-hooks-events.md)
10. [415 — Verify native Access and provider composition](415-access-plugin-composition.md)
11. [427 — Verify the complete ACL PostgreSQL vertical](427-acl-postgres-e2e.md)

## Active ACL hardening execution order

The post-implementation audit is tracked by the active
[ACL hardening and DX plan](../../CURRENT_PLAN.md). It must finish before an
authentication plugin or another persisted policy provider builds on ACL:

1. [429 — Enforce singular ACL management before authorization bypass](429-enforce-singular-acl-management.md)
2. [430 — Resolve optional ACL subject providers lazily](430-resolve-optional-acl-providers-lazily.md)
3. [431 — Align ACL create and update input resolution data](431-align-acl-input-resolution-data.md)
4. Schema issue 144 contextualizes extension callbacks from sibling fields
5. Runtime issue 351 removes synthetic consumers for optional committed events
6. [432 — Batch ACL reference cleanup with stable cursors](432-batch-acl-reference-cleanup.md)
7. [433 — Harden concurrent ACL reference lifecycle](433-harden-concurrent-acl-reference-lifecycle.md)
8. [434 — Restructure ACL runtime internals](434-restructure-acl-runtime-internals.md)
9. [435 — Verify the hardened ACL vertical](435-verify-hardened-acl-vertical.md)

Issues 407 and 408 previously described a separate CLP provider. Issue 408 is
complete and records the consolidation in ADR-0120. Issues 413
and 414 previously described a separate field-permission provider. Those plans
were retired before implementation because issues 401, 421, 418, and 419
already provide the more general native behavior with a smaller public API.

The completed
[stored-role plan](../../docs/plans/completed/developer-defined-stored-roles.md)
treats every role domain as one developer-defined `RoleSchema` tied to an exact member schema. The
option-light roles plugin discovers those declarations, while ordinary schema
configuration owns custom fields, indexes, Access, hooks, and Query behavior.
ACL is implemented independently against the neutral contracts from issue 420
and does not import the official roles package.

ADR-0122 freezes the immutable class API, optional principal bridge, versioned
JSON, row-aware defaults, shared create/update input resolution, entry limits,
subject cleanup ownership, and audited master bypass for this vertical.
