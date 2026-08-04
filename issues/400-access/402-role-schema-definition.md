# 402: Define extensible role schemas

- Status: ready
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 103, 112, 204, 339, 349, 420, 747
- ADR: ADR-0002, ADR-0005, ADR-0109, ADR-0115, ADR-0119

## Goal

Provide `RoleSchema.define()` as a role-aware specialization of
`Schema.define()`. The developer declares, extends, registers, queries, and
protects the role schema while `@ultimabase/roles` contributes only the
reserved fields and capabilities required by stored roles.

## Target developer experience

```ts
const AppRole = RoleSchema.define({
	className: 'Role',
	members: {
		schema: UserSchema,
	},
	fields: {
		description: stringField(),
		priority: intField({ default: 0 }),
	},
	access: {
		operation: {
			read: true,
			create: ({ context }) => context.access.mode === 'master',
			update: ({ context }) => context.access.mode === 'master',
			delete: ({ context }) => context.access.mode === 'master',
		},
	},
})

const Editor = await new AppRole({
	name: 'editor',
	description: 'Content editors',
}).create({ useMasterKey: true })

const advanced = new Query(AppRole)
```

## Acceptance criteria

- [ ] `RoleSchema.define()` requires one exact member schema and accepts the ordinary class name, table name, custom fields, indexes, Access, hooks, and schema options supported by `Schema.define()`.
- [ ] The returned value is an exact constructible schema-model class accepted by registries, `new Query(AppRole)`, `AppRole.query()`, model commands, hooks, Access, relations, adapters, and transports.
- [ ] The definition injects required `name`, `members`, and nested-role relation fields plus any private normalized identity field without duplicating them in developer configuration.
- [ ] Injected fields preserve exact member and self-role inference, concise hovers, English JSDoc, and normal schema inspection while private implementation values remain unreadable by default.
- [ ] Reserved field collisions fail during definition with precise diagnostics; unrelated custom fields remain ordinary first-class fields.
- [ ] Stored names are non-empty and unique under one documented locale-independent normalization strategy, while UUID remains the stable persisted identity across rename.
- [ ] `new AppRole(input)` is an immutable draft and inherited `create`, `upsert`, `update`, and `delete` commands retain the standard model-command semantics from issue 349.
- [ ] `create()` returns a new persisted `AppRole`; the draft is never mutated or silently promoted.
- [ ] `AppRole.role(name)` and an explicit `{ id }` form create immutable schema-qualified references for Access and ACL declarations without performing I/O, guessing whether a string is a name or UUID, or requiring all custom create fields.
- [ ] `rolesPlugin()` claims the private RoleSchema extension and discovers every registered role schema without receiving schema, field, Access, hook, or index options.
- [ ] Installing no roles plugin remains valid until a `RoleSchema` is registered; registering one without its owning plugin fails before infrastructure starts.
- [ ] Generated transports hide role schemas by default while trusted server code retains the complete public Query API.
- [ ] Core knows no RoleSchema, member schema, stored role, or roles-plugin vocabulary.

## Tests

- [ ] Runtime, normalization, inference, draft/persisted, model-command, Query-equivalence, Access, hook, extension-ownership, reserved-field, language-service, public-export, packed-package, and application-isolation tests.

## Out of scope

- Member and nested-role mutations.
- Request-local role resolution and `hasRole()`.
- Transport routes or GraphQL types for role administration.
