# @ultimabase/acl-permissions-plugin

Official `aclPlugin` Access provider, `acl()` schema extension, and immutable
`ACL` class.

ACL grants object-level `read`, `update`, `delete`, and `manageAcl` rights to
public, authenticated, exact-principal, and role subjects. One ACL may contain
any number of principals and roles. It contributes native Access filters, item
checks, and field restrictions that compile into database filtering rather than
post-filtering in memory.

PostgreSQL stores the ACL as indexed JSONB on the protected row. Normal reads
therefore require no ACL-table join, while the adapter still evaluates public,
principal, and resolved-role grants inside SQL.

The active implementation plan targets this API:

```ts
const value = new ACL()
	.grantPublic('read')
	.grantPrincipal(User.pointer(aliceId), 'read', 'update')
	.grantPrincipal(User.pointer(bobId), 'read')
	.grantRole(Editor, 'read', 'update')

const updated = value.revokePrincipal(User.pointer(aliceId), 'read')
const restored = ACL.fromJSON(updated.toJSON())
```

Create and update use the same ACL value. `acl()` may generate a default from
the field-resolved create candidate and uses one shared input callback for both
operations. The complete row is revalidated before Access. Updating or reading
the ACL field requires `manageAcl`.

Authentication and roles are optional providers. ACL discovers them only
through neutral Core services and never imports a concrete auth or roles
plugin. Trusted master execution bypasses ACL authorization but still runs
validation, defaults, hooks, transactions, constraints, and audit behavior.

The extension also works on a developer-defined RoleSchema. Native RoleSchema
Access controls creation, while each persisted role ACL may narrow reads,
updates, member or nested-role mutations, deletion, and ACL management.

This package is currently a placeholder. Follow the active
[`CURRENT_PLAN.md`](../../CURRENT_PLAN.md) before treating the examples above as
implemented exports.
