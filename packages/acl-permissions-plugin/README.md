# @ultimabase/acl-permissions-plugin

Provides the immutable `ACL` class, the typed `acl()` schema extension, and the
optional `aclPlugin()` provider.

ACL grants object-level `read`, `update`, `delete`, and `manageAcl` rights to
public, authenticated, exact-principal, and role subjects. One ACL may contain
any number of principals and roles. The provider will contribute native Access
filters, item checks, and field restrictions that compile into database
filtering rather than post-filtering in memory.

PostgreSQL support will store the ACL as indexed JSONB on the protected row.
Normal reads will therefore require no ACL-table join, while the adapter will
still evaluate public, principal, and resolved-role grants inside SQL.

The immutable ACL value currently supports this API:

```ts
const value = new ACL()
	.grantPublic('read')
	.grantPrincipal(User.pointer(aliceId), 'read', 'update')
	.grantPrincipal(User.pointer(bobId), 'read')
	.grantRole(Editor, 'read', 'update')

const updated = value.revokePrincipal(User.pointer(aliceId), 'read')
updated.permissionsForRole(Editor)

const document = updated.toJSON()
const restored = ACL.fromJSON(JSON.parse(JSON.stringify(document)))
```

`ACLJSON` is a detached versioned format. Parsing rejects unknown keys,
versions, subjects, and permissions. Repeated rights and repeated entries are
combined by union, then serialized in canonical order.

`acl()` injects one reserved, required `acl: ACL` field without requiring a
manual field declaration. Create input keeps that field optional because
`aclPlugin()` supplies a static or asynchronous default after ordinary field
input resolution and before structural revalidation:

```ts
const Post = Schema.define({
	className: 'Post',
	fields: {
		title: stringField({ validation: { required: true } }),
		visibility: stringField(),
	},
	extensions: [
		acl({
			default: ({ data, principal }) => {
				const initial =
					data.visibility === 'public'
						? new ACL().grantPublic('read')
						: new ACL()

				return principal === undefined
					? initial
					: initial.grantPrincipal(principal, 'read', 'manageAcl')
			},
		}),
	],
})
```

Explicit ACL input is rejected unless the schema declares `resolveInput`.
Create-many evaluates the default independently for every item inside the root
transaction. The next milestone step completes update resolution and native
Access enforcement; updating or reading the ACL field will require `manageAcl`.

Authentication and roles are optional providers. ACL discovers them only
through neutral Core services and never imports a concrete auth or roles
plugin. Trusted master execution bypasses ACL authorization but still runs
validation, defaults, hooks, transactions, constraints, and audit behavior.

The extension also works on a developer-defined RoleSchema. Native RoleSchema
Access controls creation, while each persisted role ACL may narrow reads,
updates, member or nested-role mutations, deletion, and ACL management.

Native Access and PostgreSQL integration remain tracked by
[`CURRENT_PLAN.md`](../../CURRENT_PLAN.md).
