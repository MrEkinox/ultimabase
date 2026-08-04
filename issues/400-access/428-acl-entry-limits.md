# 428: Enforce configurable ACL entry limits

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`
- Depends on: 409, 410, 411
- ADR: ADR-0122

## Goal

Bound persisted ACL size without complicating the common zero-option plugin
setup or coupling limits to one database adapter.

## Target developer experience

```ts
aclPlugin({
	limits: {
		maxPrincipals: 100,
		maxRoles: 50,
	},
})
```

## Acceptance criteria

- [ ] `aclPlugin()` remains valid with no options and exposes named, documented limit options with concise autocomplete and hovers.
- [ ] Plugin-level principal and role limits provide application defaults.
- [ ] `acl({ limits })` may narrow or explicitly override those defaults for one schema.
- [ ] Limits count canonical subject entries rather than grant calls or individual rights.
- [ ] Public and authenticated rights do not consume principal or role entry limits.
- [ ] Static defaults, asynchronous default factories, explicit create input, and updates are checked before persistence.
- [ ] Exceeding a limit fails with one typed validation error and leaks no partial mutation.
- [ ] Master bypasses ACL authorization but not entry-limit validation.
- [ ] Limit enforcement is adapter-neutral and cannot be disabled by transport input.

## Tests

- [ ] Boundary, override, duplicate-subject, create, update, create-many rollback, master, public-export type, and language-service tests.
