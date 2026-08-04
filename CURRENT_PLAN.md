# Active plan: ACL hardening and developer-experience consolidation

- Status: ready
- Started: 2026-08-04
- Objective owner: `@ultimabase/core`, `@ultimabase/acl-permissions-plugin`, `@ultimabase/acl-postgres-plugin`, `@ultimabase/roles-plugin`, `@ultimabase/postgres-plugin`
- Previous completed objective: [Persisted object ACL](docs/plans/completed/persisted-object-acl.md)

## Objective

Resolve the security, provider-ordering, callback-contract, cleanup, event, and
maintainability findings from the completed ACL vertical audit before building
authentication or another persisted policy provider on top of ACL.

The milestone preserves this developer-facing direction:

```ts
const Post = Schema.define({
	className: 'Post',
	fields: {
		title: stringField({ validation: { required: true } }),
		visibility: stringField(),
	},
	extensions: [
		acl({
			default: ({ data, principal }) =>
				principal === undefined
					? new ACL().grantPublic('read')
					: new ACL().grantPrincipal(principal, 'read', 'update'),
		}),
	],
})
```

`data.title` and `data.visibility` must be inferred without a duplicated manual
type. Trusted master execution may manage one ACL through a prepared singular
update but can never bypass validation, limits, role normalization, cleanup,
events, or mutation-shape invariants.

## Frozen constraints

- Core remains unaware of ACL, roles, authentication, users, and concrete adapters.
- ACL authorization bypass and ACL document invariants remain separate concerns.
- Optional providers are resolved by neutral token after plugin setup and never by plugin name.
- The shared create/update input callback receives one documented, non-misleading data contract.
- ACL management remains master-only and object rights stay `read`, `update`, and `delete`.
- Cleanup remains singular, hook-aware, and transaction-bound; batching or concurrency hardening must not introduce direct adapter persistence.
- Optional committed notifications add no synthetic consumer or post-commit work when unused.
- Refactoring follows behavior fixes and changes no public ACL value, JSON, plugin, or constraint identity.
- Every issue receives its own commit and no push occurs without explicit user confirmation.

## Execution order

### Phase 1 — Security and provider composition

1. [x] [429 — Enforce singular ACL management before authorization bypass](issues/400-access/429-enforce-singular-acl-management.md)
2. [x] [430 — Resolve optional ACL subject providers lazily](issues/400-access/430-resolve-optional-acl-providers-lazily.md)

### Phase 2 — Callback semantics and IntelliSense

3. [x] [431 — Align ACL create and update input resolution data](issues/400-access/431-align-acl-input-resolution-data.md)
4. [x] [144 — Contextualize schema extension callbacks from sibling fields](issues/100-schema/144-contextual-schema-extension-callbacks.md)

### Phase 3 — Runtime events and reference lifecycle

5. [x] [351 — Support optional committed events without synthetic consumers](issues/300-query-runtime/351-optional-committed-events.md)
6. [ ] [432 — Batch ACL reference cleanup with stable cursors](issues/400-access/432-batch-acl-reference-cleanup.md)
7. [ ] [433 — Harden concurrent ACL reference lifecycle](issues/400-access/433-harden-concurrent-acl-reference-lifecycle.md)

### Phase 4 — Maintainability and final proof

8. [ ] [434 — Restructure ACL runtime internals](issues/400-access/434-restructure-acl-runtime-internals.md)
9. [ ] [435 — Verify the hardened ACL vertical](issues/400-access/435-verify-hardened-acl-vertical.md)

## Completion gate

- Every issue and dependency is complete with a dedicated commit.
- The master set-based ACL regression and both plugin orders are proven before later refactoring begins.
- Public extension callbacks expose concise schema-aware autocomplete and hover documentation.
- PostgreSQL proves bounded and concurrency-safe reference cleanup, rollback, events, and application isolation.
- Focused coverage distinguishes source unit paths from packed E2E behavior and records remaining intentional gaps.
- Repository typecheck, tests, lint, formatting, dependency constraints, build, packed exports, and complete PostgreSQL E2E pass.
- Documentation and ADR refinement links describe one current behavior before this plan is archived.
