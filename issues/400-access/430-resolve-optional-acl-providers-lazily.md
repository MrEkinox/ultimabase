# 430: Resolve optional ACL subject providers lazily

- Status: done
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`, `@ultimabase/core`, `@ultimabase/roles-plugin`
- Depends on: 415, 425, 427
- ADR: ADR-0117, ADR-0122

## Goal

Make neutral principal and role providers independent from top-level or nested
plugin configuration order without turning either provider into a mandatory ACL
dependency.

## Acceptance criteria

- [x] ACL looks up optional subject services only after every plugin setup callback has completed.
- [x] `plugins: [aclPlugin(), rolesPlugin()]` and the reverse order produce identical subject resolution and authorization.
- [x] Nested plugin configuration remains equivalent to both top-level orders.
- [x] Role-free ACL schemas continue to support public and master behavior without a role provider.
- [x] Statically known role-aware ACL configuration reports a typed missing-service error before infrastructure starts when no compatible provider exists.
- [x] Dynamically produced role grants fail before persistence when current-role enumeration or stable-role resolution is unavailable.
- [x] ACL consumes only neutral Core service tokens and never imports or identifies the official authentication or roles plugin.
- [x] Resolver instances and caches remain isolated by application and request engine.

## Tests

- [x] Composition tests cover both plugin orders, nesting, community-compatible providers, absent providers, and two parallel applications.
- [x] PostgreSQL proves that reversing ACL and roles configuration does not change visible rows or persisted role UUIDs.
