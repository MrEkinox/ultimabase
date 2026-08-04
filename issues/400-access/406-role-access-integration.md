# 406: Integrate stored roles with native Access

- Status: done
- Milestone: 4
- Packages: `@ultimabase/roles-plugin`
- Depends on: 204, 207, 404, 405, 407, 417, 420
- ADR: ADR-0003, ADR-0113, ADR-0116, ADR-0117, ADR-0119

## Goal

Complete option-light `rolesPlugin()` discovery, current-member resolution,
request-local hierarchy memoization, and `hasRole()` as an ordinary native
Access decision. Stored roles provide membership context and never grant an
operation or field permission by themselves.

## Target developer experience

```ts
const AppRole = RoleSchema.define({
	className: 'Role',
	members: {
		schema: UserSchema,
		resolveCurrent: ({ context }) => {
			const user = context.getValue(authenticatedUser)

			return user === undefined ? undefined : UserSchema.pointer(user.id)
		},
	},
	fields: {},
})

const Editor = AppRole.role('editor')

const Post = Schema.define({
	className: 'Post',
	access: {
		operation: {
			read: true,
			update: hasRole(Editor),
		},
	},
	fields: {},
})

const ultimabase = new UltimaBase({
	schemas: [UserSchema, AppRole, Post],
	plugins: [rolesPlugin()],
})
```

## Acceptance criteria

- [x] `rolesPlugin()` takes no schema, fields, indexes, Access, hooks, member relation, deletion policy, or transport options; those belong to each `RoleSchema.define()` declaration or the relevant transport.
- [x] The plugin discovers and validates registered RoleSchema extensions by exact schema identity and keeps multiple role domains isolated.
- [x] Each role domain may provide one precisely typed, effect-free `resolveCurrent` callback returning its exact member Pointer; omission keeps administration and Query valid while current-member Access checks deny normally.
- [x] The plugin provides the neutral role resolver capability from issue 420 without consumers importing or identifying its factory.
- [x] Direct and inherited membership is memoized as one immutable request-local snapshot per RoleSchema and current member; repeated native or ACL checks do not repeat graph traversal.
- [x] `hasRole(AppRole.role(name))` and the explicit UUID-reference form return compact, documented native Access decisions compatible with schema operation, item, and field decisions.
- [x] Calling `hasRole` without an installed provider fails closed with a typed provider error before business hooks or adapter execution; an installed but unresolved or non-member request returns denial normally.
- [x] ACL and community providers consume only neutral contracts and never import or identify `rolesPlugin` or a concrete RoleSchema.
- [x] Role schemas remain hidden from generated transports by default; explicit transport exposure is configured by the transport rather than `rolesPlugin()`.
- [x] Services, RoleSchema identities, cached snapshots, member resolvers, requests, and plugin lifecycle remain isolated per application.

## Tests

- [x] Public type, IntelliSense, schema discovery, zero/one/multiple-domain, service-contract, missing-provider, unresolved-member, direct, inherited, memoization, master, community-provider, transport-metadata, and application-isolation tests.

The package suite covers contracts, graph behavior, caching, unresolved members,
master semantics, discovery, service provision, transport metadata, and
application isolation. Issue 423 owns the final public PostgreSQL proof that a
missing provider stops before hooks or adapter execution and that a compatible
community provider is interchangeable at runtime.

## Out of scope

- Authentication credentials, sessions, or a native User schema.
- Defining schema or field Access on behalf of the developer.
- Persisting externally managed JWT, OAuth, or identity-provider role claims; compatible providers may implement the neutral resolver contract directly.
