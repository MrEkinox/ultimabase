# 402: Define extensible role schemas

- Status: done
- Milestone: 4
- Packages: `@ultimabase/roles-plugin`
- Depends on: 103, 112, 204, 339, 349, 420, 747
- ADR: ADR-0002, ADR-0005, ADR-0109, ADR-0115, ADR-0119

## Goal

Provide `RoleSchema.define()` as a role-aware specialization of
`Schema.define()`. The developer declares, extends, registers, queries, and
protects the role schema while `@ultimabase/roles-plugin` contributes only the
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

- [x] `RoleSchema.define()` requires one exact member schema and accepts the ordinary class name, adapter extensions, custom fields, indexes, Access, hooks, and schema options supported by `Schema.define()`.
- [x] The returned value is an exact constructible schema-model class accepted by registries, `new Query(AppRole)`, `AppRole.query()`, model commands, hooks, Access, relations, adapters, and transports.
- [x] The definition injects required `name`, `members`, and nested-role relation fields without duplicating them in developer configuration; normalized `name` is the single identity column.
- [x] Injected fields preserve exact member and self-role inference, concise hovers, English JSDoc, and normal schema inspection.
- [x] Reserved field collisions fail during definition with precise diagnostics; unrelated custom fields remain ordinary first-class fields.
- [x] Stored names are non-empty and unique under one documented locale-independent normalization strategy, while UUID remains the stable persisted identity across rename.
- [x] `new AppRole(input)` is an immutable draft and inherited `create`, `upsert`, `update`, and `delete` commands retain the standard model-command semantics from issue 349.
- [x] `create()` returns a new persisted `AppRole`; the draft is never mutated or silently promoted.
- [x] `AppRole.role(name)` and an explicit `{ id }` form create immutable schema-qualified references for Access and ACL declarations without performing I/O, guessing whether a string is a name or UUID, or requiring all custom create fields.
- [x] `rolesPlugin()` claims the private RoleSchema extension and discovers every registered role schema without receiving schema, field, Access, hook, or index options.
- [x] Installing no roles plugin remains valid until a `RoleSchema` is registered; registering one without its owning plugin fails before infrastructure starts.
- [x] Generated transports receive hidden-by-default role metadata while trusted server code retains the complete public Query API.
- [x] Core knows no RoleSchema, member schema, stored role, or roles-plugin vocabulary.

## Tests

- [x] Runtime, normalization, inference, draft, model-command, Query-equivalence, Access, hook, extension-ownership, reserved-field, language-service, public-export, and application-isolation tests. Packed-package coverage remains in the repository release checks.

## Out of scope

- Member and nested-role mutations.
- Request-local role resolution and `hasRole()`.
- Transport routes or GraphQL types for role administration.
