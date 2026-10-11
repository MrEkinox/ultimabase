# ADR-0322: Role schema factory, linked hierarchy and role queries

- Status: proposed
- Date: 2026-10-11
- Refines: the Roles plugin records, ADR-0297 (form D, amendment 3 and the step 4 `Register`
  workaround), ADR-0304 (principal and `hasRole`), ADR-0308 (links), ADR-0310 (plain results),
  ADR-0316 (slots); applies ADR-0288
- Approval: decisions of the Roles review (`docs/handoff/revue-plugins/roles.md`, decisions 1 to
  10, validated by the user on 2026-10-09); record to be accepted by the user
- Already implemented elsewhere: current member from the Core principal and `hasRole` as a
  predicate (ADR-0304), plain results (ADR-0310), membership through `connect` (ADR-0308)

## Context

Role schemas are declared with the old-form `RoleSchema.define`, which reads the registry while
it is typed and forced the step 4 workaround (applications with Roles register a schema-less
application). Applications allow exactly one role schema, the hierarchy field is called
`roles` (ambiguous next to `members`), roles are only usable inside rules, and seed roles must be
created by hand.

## Decision

1. **Form D factory.** `App.RoleSchema.define({ className, members: () => TodoUser, deletion,
fields })` returns a form D declaration that ends with `.with({ … })`; `deletion` is
   `'fail' | 'preserve' | 'cascade'`. Several role schemas are allowed in one application. The
   factory is proven on TypeScript 6 and 7 without the TS7022 cycle, and applications with Roles
   register `typeof ultimabase` again: the step 4 workaround is removed.
2. **Hierarchy field `includedRoles`.** The relation `roles` is renamed `includedRoles`;
   `members: { connect }` and `includedRoles: { connect }` go through the link vocabulary, with
   the plugin's cycle and depth checks applied to those changes.
3. **Role queries outside rules.** `ultimabase.plugin(rolesPlugin)` exposes `has(Admin)` (current
   request), `has(Admin, { principal })` and `current(TodoRole)` (roles of the current request,
   inheritance included), with the same computation and cache as the rules.
4. **Seed roles.** `ensure: ['admin', 'editor']` on `App.RoleSchema.define` creates the missing
   roles at `start()`, idempotently, without changing existing ones.
5. **Kept.** References by name and by identifier, bounded inheritance, the three deletion modes,
   no plugin option, role events consumable by the application (best effort).

## Consequences

- create-app and the examples move their role schemas to the factory.
- Tests: factory typing and hovers from source and built packages on TypeScript 6 and 7, several
  role schemas, `Register` with Roles, `includedRoles` links with cycle and depth errors,
  `has`/`current`, `ensure` idempotence and concurrency; DX audit and form D bench.
- Documentation impact: both (Roles page and README, create-app).

## Out of scope

Permissions attached to roles (`hasPermission`), per-organization role uniqueness (future
multi-tenant plugin).
