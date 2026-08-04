# 406: Implement rolesPlugin and role Access helpers

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 204, 207, 405, 407, 420
- ADR: ADR-0003, ADR-0005, ADR-0113, ADR-0116, ADR-0117

## Goal

Install role persistence and request-local role resolution through
`rolesPlugin`, then expose concise helpers that produce ordinary native Access
decisions. A role provides membership context and never grants a permission by
itself.

## Target developer experience

```ts
const Editor = new Role({ name: 'editor' })

const Post = Schema.define({
	className: 'Post',
	access: {
		operation: {
			read: true,
			create: hasRole(Editor),
			update: hasRole(Editor),
			delete: hasRole(new Role({ name: 'administrator' })),
		},
	},
	fields: {},
})

const ultimabase = new UltimaBase({
	schemas: [Post],
	plugins: [rolesPlugin()],
})
```

## Acceptance criteria

- [ ] The public factory is named `rolesPlugin`; no public API calls it a permission plugin.
- [ ] The plugin provides an application-local role administration service and the neutral resolver capability from issue 420.
- [ ] The plugin accepts a typed, plugin-neutral way to derive the current stable subject reference from request context; omitting it keeps role administration usable while request membership denies normally.
- [ ] Request role membership is memoized as one immutable request-local snapshot; repeated native or ACL checks never repeat graph traversal for the same context.
- [ ] `hasRole(role)` returns a precisely typed native Access decision compatible with schema operation, item, and field decisions.
- [ ] Calling `hasRole` without an installed provider fails closed with a typed provider error before business hooks or adapter execution; an installed but unidentified or non-member request returns denial normally.
- [ ] ACL and community providers consume only neutral contracts and never import or identify `rolesPlugin`.
- [ ] Role administration and optional transport metadata are hidden unless exposure is enabled explicitly.
- [ ] Plugin services, schemas, cached snapshots, and requests remain isolated per application.

## Tests

- [ ] Public type, IntelliSense, service-contract, missing-provider, unidentified-subject, direct, inherited, memoization, master, community-provider, and application-isolation tests.

## Out of scope

- Defining schema or field permissions on behalf of the developer.
- Authentication credentials, sessions, or a User schema.
