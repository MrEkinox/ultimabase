# 724: Add tenant isolation plugin

- Status: planned
- Milestone: 7+
- Packages: future `@ultimabase/multi-tenant-plugin`
- Depends on: 617
- ADR: new ADR required

## Goal

Provide typed tenant request context and compile non-bypassable isolation as a
native Access filter on every configured schema operation.

## Acceptance criteria

- [ ] Master does not bypass isolation by default.
- [ ] Installing no tenant plugin adds no context value, schema field, Access contribution, or Runtime stage.
- [ ] Tenant predicates compose monotonically with native schema Access, ACL, soft deletion, relations, and developer Query predicates.
- [ ] Runtime, Query, hooks, and database adapters contain no tenant-specific execution branch.
- [ ] Cross-tenant relation and bulk operations are rejected.
