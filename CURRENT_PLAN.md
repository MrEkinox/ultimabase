# Current plan: persisted object ACL

- Status: active
- Started: 2026-08-04
- Objective owner: `@ultimabase/acl-permissions-plugin`, `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Governing decisions: [ADR-0005](docs/adr/0005-immutable-class-api.md), [ADR-0113](docs/adr/0113-plugin-owned-authentication-context.md), [ADR-0116](docs/adr/0116-fundamental-access-system.md), [ADR-0117](docs/adr/0117-optional-access-subject-capabilities.md), [ADR-0119](docs/adr/0119-developer-defined-role-schemas.md), [ADR-0122](docs/adr/0122-immutable-persisted-object-acls.md)
- Previous completed objective: [Developer-defined stored roles](docs/plans/completed/developer-defined-stored-roles.md)
- Resume point: issue 410

## Objective

Implement persisted object ACL as an optional provider for native Access. The
vertical must support applications with no authentication or roles, accept any
number of exact principals and roles when their neutral providers are present,
compile row restrictions into PostgreSQL, protect the ACL field with
`manageAcl`, and preserve automatic transactions and post-commit auditing.

The target developer experience is:

```ts
const Post = Schema.define({
	className: 'Post',
	fields: {
		title: stringField({ validation: { required: true } }),
		visibility: enumField({ values: ['private', 'public'] as const }),
	},
	extensions: [
		acl({
			default: ({ data, principal }) => {
				let value = new ACL()

				if (data.visibility === 'public') {
					value = value.grantPublic('read')
				}

				return principal === undefined
					? value
					: value.grantPrincipal(
							principal,
							'read',
							'update',
							'delete',
							'manageAcl',
						)
			},
		}),
	],
})

const sharedAcl = new ACL()
	.grantPrincipal(User.pointer(aliceId), 'read', 'update')
	.grantPrincipal(User.pointer(bobId), 'read')
	.grantRole(Editor, 'read', 'update')

const restrictedAcl = sharedAcl
	.revokePrincipal(User.pointer(aliceId), 'read')
	.setRolePermissions(Editor, 'read')

restrictedAcl.permissionsForPrincipal(User.pointer(aliceId))
restrictedAcl.permissionsForRole(Editor)

const restoredAcl = ACL.fromJSON(restrictedAcl.toJSON())

const ultimabase = new UltimaBase({
	schemas: [User, AppRole, Post],
	plugins: [rolesPlugin(), aclPlugin(), postgresPlugin()],
})

await Post.query().find({ ultimabase })
await Post.query().find({ ultimabase, useMasterKey: true })
```

Authentication is omitted from the example intentionally. A compatible auth
plugin may provide the current principal through Core's neutral resolver; ACL
never imports or identifies that plugin.

## Frozen decisions

- ACL rights are exactly `read`, `update`, `delete`, and `manageAcl`.
- `ACL` is an immutable, non-persisting value class with symmetric grant,
  revoke, replace, and inspection methods.
- One ACL may contain any number of principals and roles. Principal identity is
  schema plus object ID; role identity is schema-qualified and persisted by UUID.
- `toJSON()` is versioned and detached; `fromJSON(unknown)` validates strictly
  and performs no I/O.
- `acl()` is a schema extension; `aclPlugin()` is the optional Access provider.
- A default ACL may be static or asynchronous and may read the exact
  field-resolved create candidate, optional principal, and context. The complete
  row is revalidated before Access.
- One `resolveInput` callback serves create and update. Existing ACL changes
  require `manageAcl`.
- Plugin options stay limited to default entry limits; schema configuration may
  override them.
- Subject-owning providers define deletion policy. ACL contributes neutral
  inspection and cleanup without importing those providers.
- Missing principal identity fails closed. Missing role resolution fails before
  accepting or evaluating a role-aware ACL path.
- ACL always combines with native Access and other providers through logical
  `AND`.
- Master bypasses ACL authorization only. Validation, default generation,
  hooks, transactions, constraints, and audit behavior still run.
- Runtime and Query never contain ACL-specific stages or AST nodes.

## Execution order

### Phase 1 — Immutable public value

1. [x] [409 — Implement the immutable ACL class](issues/400-access/409-acl-class.md)
2. [x] [424 — Add versioned ACL JSON serialization](issues/400-access/424-acl-json-serialization.md)

### Phase 2 — Optional identity and schema configuration

3. [x] [425 — Define the neutral current-principal resolver](issues/400-access/425-current-principal-resolver.md)
4. [ ] [410 — Implement the ACL schema extension](issues/400-access/410-acl-schema-extension.md)

### Phase 3 — Native Access and PostgreSQL

5. [ ] [411 — Implement aclPlugin Access contributions](issues/400-access/411-acl-plugin.md)
6. [ ] [428 — Enforce configurable ACL entry limits](issues/400-access/428-acl-entry-limits.md)
7. [ ] [510 — Store ACL in indexed JSONB columns](issues/500-postgres/510-acl-jsonb-storage.md)
8. [ ] [509 — Compile PostgreSQL ACL constraints](issues/500-postgres/509-postgres-access-compilers.md)

### Phase 4 — Lifecycle and composition

9. [ ] [426 — Integrate ACL subject-reference cleanup](issues/400-access/426-acl-reference-cleanup.md)
10. [ ] [412 — Add ACL hooks and post-commit events](issues/400-access/412-acl-hooks-events.md)
11. [ ] [415 — Verify Access-provider composition](issues/400-access/415-access-plugin-composition.md)

### Phase 5 — Complete public proof

12. [ ] [427 — Verify the complete ACL PostgreSQL vertical](issues/400-access/427-acl-postgres-e2e.md)

## Completion gate

- Focused runtime, type, language-service, package-export, and immutability tests pass.
- Docker-backed PostgreSQL tests prove every subject and right, row hiding,
  `manageAcl`, RoleSchema protection, master bypass, cleanup, rollback, and
  application isolation.
- Repository typecheck, tests, lint, formatting, dependency constraints, build,
  and packed-package checks pass.
- The package README and Access concept documentation show only implemented
  public syntax when the plan is archived.
