# 415: Verify native Access and policy-provider composition

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/core`, `@ultimabase/roles-plugin`, `@ultimabase/acl-permissions-plugin`
- Depends on: 407, 411, 419, 420, 423
- ADR: ADR-0003, ADR-0006, ADR-0090, ADR-0116

## Goal

Prove native schema and field Access, role-aware decision helpers, and
persisted ACL policies work independently and compose through one immutable
`AccessPlan`.

## Acceptance criteria

- [ ] Native schema operation Access provides complete class-level authorization without installing ACL or roles.
- [ ] Native field Access controls item, filter, order, create, and update use without installing a field-permission package.
- [ ] `rolesPlugin` works without ACL, and ACL works without roles when no ACL subject references a role.
- [ ] Native declarations, role-aware helpers, ACL, and a fixture community provider combine through logical `AND`; none can override another denial.
- [ ] A direct `hasRole` rule without a provider fails closed with a typed error before business effects; an ACL role subject records a static requirement and fails setup before infrastructure starts.
- [ ] ACL consumes the neutral role-resolution capability without inspecting the provider's plugin name or implementation; a compatible fixture provider is sufficient.
- [ ] Nested plugin configuration remains only graph-ordering sugar and changes no authorization result.
- [ ] Runtime diagnostics retain generic Access provenance without CLP, role, or ACL execution branches.

## Tests

- [ ] Configuration and execution matrices cover native-only, roles-only, ACL-only, combined, role-free, missing-provider, compatible-provider, top-level, nested, anonymous, and master cases.
