# 433: Harden concurrent ACL reference lifecycle

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/core`, `@ultimabase/acl-permissions-plugin`, `@ultimabase/acl-postgres-plugin`, `@ultimabase/roles-plugin`
- Depends on: 432
- ADR: new ADR required

## Goal

Define and implement a provider-neutral coordination protocol so concurrent ACL
writes cannot create a new live reference while its owning subject is being
deleted under `fail` or `cascade` policy.

## Acceptance criteria

- [ ] A new ADR defines the supported transaction-isolation and lock coordination semantics for subject owners and reference providers.
- [ ] `fail` cannot pass while a concurrent accepted write creates a reference to the subject being deleted.
- [ ] Successful `cascade` leaves no matching ACL entry accepted before the deletion commit.
- [ ] Role and community subject providers can participate through neutral Core contracts without ACL importing their packages.
- [ ] `preserve` deliberately remains an inert-reference policy and performs no cleanup coordination beyond subject-owner requirements.
- [ ] UUID identity reuse and preserved-reference behavior remain explicitly documented.
- [ ] The protocol does not expose database clients, SQL, or adapter state to application code.

## Tests

- [ ] Deterministic PostgreSQL concurrency tests cover competing principal and role reference writes for `fail` and `cascade`.
- [ ] Rollback releases coordination state and lets a later valid write proceed.
