# Completed plan: developer-defined stored roles

- Status: completed
- Started: 2026-08-04
- Completed: 2026-08-04
- Objective owner: `@ultimabase/roles-plugin`, `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Governing decisions: [ADR-0002](../../adr/0002-static-schemas-and-typed-extensions.md), [ADR-0005](../../adr/0005-immutable-class-api.md), [ADR-0099](../../adr/0099-automatic-mutation-transactions.md), [ADR-0109](../../adr/0109-constructible-schema-models.md), [ADR-0115](../../adr/0115-immutable-model-commands.md), [ADR-0116](../../adr/0116-fundamental-access-system.md), [ADR-0117](../../adr/0117-optional-access-subject-capabilities.md), [ADR-0118](../../adr/0118-transport-neutral-relations.md), [ADR-0119](../../adr/0119-developer-defined-role-schemas.md)
- Previous completed objective: [Transport-neutral pointers and relations](transport-neutral-relations.md)

## Objective

Add developer-defined, schema-backed stored roles as an optional provider for
native Access. The vertical must reuse ordinary Schema, Query, model commands,
relations, hooks, Access, transactions, PostgreSQL, and application isolation
without creating an internal role database API or teaching Core about roles.

The finished vertical targets this developer experience:

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

const EditorReference = AppRole.role('editor')
const AdministratorReference = AppRole.role('administrator')

const Post = Schema.define({
	className: 'Post',
	access: {
		operation: {
			read: true,
			update: hasRole(EditorReference),
			delete: hasRole(AdministratorReference),
		},
	},
	fields: {
		title: stringField(),
	},
})

const ultimabase = new UltimaBase({
	schemas: [UserSchema, AppRole, Post],
	plugins: [rolesPlugin(), postgresPlugin()],
})

const Editor = await new AppRole({
	name: 'editor',
	description: 'Content editors',
}).create({ useMasterKey: true })

const Administrator = await new AppRole({
	name: 'administrator',
}).create({ useMasterKey: true })

await Editor.addMember(UserSchema.pointer(user.id), { useMasterKey: true })
await Administrator.addRole(Editor, { useMasterKey: true })

const advanced = await new Query(AppRole)
	.greaterThan('priority', 10)
	.find({ useMasterKey: true })
```

Exact minor method spelling may be refined by its owning issue when public
type, hover, and runtime tests prove a clearer form. The schema ownership,
separate member/role commands, Access boundaries, and transaction semantics in
this plan are fixed.

## Verified contract

The objective is complete only when:

- `RoleSchema.define()` returns one exact constructible schema-model class tied to one exact member schema;
- developers can add ordinary custom fields, indexes, Access, hooks, and schema options without roles-plugin equivalents;
- reserved name, normalized identity, member relation, and nested-role relation fields are generated and validated deterministically;
- normal draft creation and immutable model CRUD work for roles through the same Runtime pipeline as application models;
- `new Query(AppRole)` and `AppRole.query()` expose the complete advanced server API without private imports;
- persisted role models expose distinct, precisely typed `addMember`, `removeMember`, `addRole`, and `removeRole` commands;
- every membership and hierarchy mutation preserves Access, hooks, automatic transactions, rollback, cancellation, and post-commit events;
- nested-role resolution is deterministic, duplicate-free, bounded, and rejects direct or indirect cycles before commit;
- schema-qualified name or UUID references survive rename and follow explicit deletion semantics;
- option-light `rolesPlugin()` discovers registered role schemas and provides the neutral resolver without knowing authentication or ACL;
- `hasRole()` is an ordinary native Access decision and repeated checks reuse one isolated request-local membership snapshot;
- generated transports hide role schemas by default while trusted server Query remains available;
- a Docker-backed public-export PostgreSQL E2E proves custom role fields, commands, hierarchy, Access, Query escape hatches, multiple role domains, and application isolation;
- Core imports no roles package, roles imports only public Core contracts, and no public type contains `any`.

## Frozen decisions

- Stored roles are developer-defined schemas, not a plugin-generated internal schema.
- `RoleSchema.define()` specializes `Schema.define()` and requires an exact member schema.
- The returned AppRole class is the persisted Role class; there is no second persistable Role object or public role repository.
- `new AppRole(input).create()` uses standard immutable model-command behavior and returns a new persisted instance.
- `AppRole.role(name)` and its explicit UUID form are lightweight configuration references used before database startup; no string is guessed to be an identifier.
- Role name is normalized and unique within its RoleSchema domain; UUID is the stable stored identity.
- `addMember` accepts only the exact member schema, while `addRole` accepts only a persisted role from the exact same role domain.
- `Administrator.addRole(Editor)` includes Editor in Administrator, so Editor members inherit Administrator.
- Draft roles never execute membership or hierarchy commands and are never mutated into persisted values.
- Direct Query and Relation use is supported but never bypasses role invariants.
- `rolesPlugin()` owns discovery, services, resolution, caching, invariants, and events; Schema declarations own data shape and native Access.
- Authentication is optional and plugin-owned. Current-member resolution reads only a developer-selected typed context value.
- ACL is not part of this objective and never becomes a dependency of roles.
- External identity-provider role claims may satisfy the neutral resolver without installing stored roles.
- Role schemas are hidden from generated transports by default; transport exposure is transport-owned.

## Completed execution order

### Phase 1 — Schema-defined role domain

1. [x] [402 — Define extensible role schemas](../../../issues/400-access/402-role-schema-definition.md)
2. [x] [403 — Add typed role member commands](../../../issues/400-access/403-role-member-commands.md)

### Phase 2 — Hierarchies and stable references

3. [x] [404 — Resolve nested roles and reject cycles](../../../issues/400-access/404-nested-role-resolution.md)
4. [x] [405 — Resolve role references and deletion policies](../../../issues/400-access/405-role-references-deletion.md)

### Phase 3 — Native Access integration

5. [x] [407 — Add composable Access decision helpers](../../../issues/400-access/407-access-decision-combinators.md)
6. [x] [406 — Integrate stored roles with native Access](../../../issues/400-access/406-role-access-integration.md)

### Phase 4 — Complete public proof

7. [x] [423 — Verify the complete stored-role vertical](../../../issues/400-access/423-role-postgres-e2e.md)

## Final verification

- Role and Core focused unit, runtime, type, and language-service suites passed.
- The repository typecheck, lint, formatting, build, dependency constraints,
  and packed-package checks passed.
- Seven worker-isolated public-export scenarios passed against live PostgreSQL
  through Testcontainers, including rollback and multiple-application proof.
