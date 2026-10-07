# 415: Verify native Access and policy-provider composition

- Status: completed
- Milestone: 4
- Packages: `@ultimabase/core`, `@ultimabase/roles-plugin`, `@ultimabase/acl-permissions-plugin`
- Depends on: 407, 411, 419, 423, 425
- ADR: ADR-0003, ADR-0006, ADR-0090, ADR-0116, ADR-0117, ADR-0122

## Goal

Prove native schema and field Access, role-aware decision helpers, and
persisted ACL policies work independently and compose through one immutable
`AccessPlan`.

## Acceptance criteria

- [x] Native schema operation Access provides complete class-level authorization without installing ACL or roles.
- [x] Native field Access controls item, filter, order, create, and update use without installing a field-permission package.
- [x] `rolesPlugin` works without ACL, and ACL works without roles when no ACL subject references a role.
- [x] ACL works without authentication for public and master requests; a compatible neutral current-principal provider enables authenticated and exact-principal grants without changing Core authority.
- [x] Native declarations, role-aware helpers, ACL, and a fixture community provider combine through logical `AND`; none can override another denial.
- [x] A direct `hasRole` rule without a provider fails closed with a typed error before business effects; accepting or evaluating an ACL role subject without a compatible provider fails before persistence or business effects.
- [x] ACL consumes the neutral role-resolution capability without inspecting the provider's plugin name or implementation; a compatible fixture provider is sufficient.
- [x] A RoleSchema carrying `acl()` compiles the independent role and ACL providers without direct package knowledge or recursive setup.
- [x] Nested plugin configuration remains only graph-ordering sugar and changes no authorization result.
- [x] Runtime diagnostics retain generic Access provenance without CLP, role, or ACL execution branches.

## Tests

- [x] Configuration and execution matrices cover native-only, roles-only, ACL-only, combined, ACL-protected RoleSchema, public-only, principal-aware, role-free, missing-provider, compatible-provider, top-level, nested, anonymous, and master cases.

The focused public-export composition fixture proves native, role-aware,
community, ACL, developer Query, and `beforeFind` restrictions in one request.
Issues 419 and 423 retain the complete native and role PostgreSQL matrices;
issue 427 owns the non-duplicated live ACL-protected RoleSchema command proof.
