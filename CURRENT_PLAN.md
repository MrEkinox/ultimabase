# Current plan: fundamental Access system

- Status: active
- Started: 2026-08-03
- Objective owner: `@ultimabase/core`, `@ultimabase/postgres`
- Governing decisions: [ADR-0090](docs/adr/0090-permission-plugins-through-hooks.md), [ADR-0102](docs/adr/0102-policy-neutral-monotonic-enforcement.md), [ADR-0103](docs/adr/0103-versioned-adapter-constraint-compilers.md), [ADR-0113](docs/adr/0113-plugin-owned-authentication-context.md), [ADR-0116](docs/adr/0116-fundamental-access-system.md)
- Previous completed objective: [Native hooks and contextual execution](docs/plans/completed/native-hooks-and-contextual-execution.md)

## Objective

Make Access a fundamental schema, field, application, and Runtime capability
before implementing concrete permission providers. Native developer policies
and plugin contributions must compile into the same monotonic plan without
making Core aware of CLP, ACL, roles, authenticated users, ownership, or field
permissions.

The finished vertical must prove this developer contract:

```ts
const Post = Schema.define({
	className: 'Post',
	access: {
		operation: {
			read: true,
			delete: ({ context }) => context.access.mode === 'master',
		},
		filter: {
			read: ({ filter }) => filter.equalTo('published', true),
		},
		item: {
			update: ({ item, input }) => item.authorId === input.authorId,
		},
	},
	fields: {
		secret: stringField({
			access: {
				read: false,
				filter: false,
				order: false,
				create: true,
				update: false,
			},
		}),
	},
})
```

## Definition of done

The objective is complete only when:

- schemas and fields expose native, precisely typed Access declarations with concise IntelliSense;
- `AccessFilter` reuses Core filter contracts without exposing Query terminals or a second filter AST;
- application setup compiles native declarations and owner-scoped plugin contributions once into immutable per-schema plans;
- operation denial, row filters, item decisions, and field restrictions execute before unsafe business effects or data exposure;
- Access filters constrain reads, counts, mutation targets, upserts, model commands, and bulk operations without entering transformable Query state;
- `beforeFind` cannot inspect, replace, or remove an Access filter;
- set-based mutations never materialize rows silently to satisfy item rules;
- optional authenticated-principal and role capabilities remain provider-owned and are required only by policies that reference them;
- a public-export PostgreSQL E2E proves native and fixture-provider composition, SQL filtering, rollback, field restriction, and non-existence semantics;
- Core Runtime and diagnostics contain no concrete permission-provider vocabulary.

## Frozen decisions

- Access is fundamental Core behavior, not a plugin.
- CLP, ACL, field permissions, tenancy, soft deletion, and community policies are Access providers.
- Access has four neutral levels: `operation`, `filter`, `item`, and `field`.
- Field decisions distinguish `read`, `filter`, `order`, `create`, and `update`.
- `filter` is retained as the public name even though it reuses Query predicate contracts internally.
- Access filters are private monotonic constraints; `beforeFind` remains a business Query transform.
- Denial composes by logical `AND`, row predicates append with `AND`, and field capabilities only intersect.
- Access runs before effectful business hooks; final output restrictions run after result transforms.
- Core authority remains `anonymous` or audited `master`. Authenticated principals and roles are optional typed values or services.
- Core defines no built-in authenticated, user, owner, role, CLP, or ACL rule node.
- Every declaration or provider owns its master-bypass policy.
- Permission providers register Access contributions rather than arbitrary business hooks for enforcement.
- Set-based update and delete remain set-based; item rules require singular or explicit itemized execution.
- Row denial behaves as non-existence, while operation and forbidden explicit-field denial use typed access errors.

## Execution order

Complete one issue at a time in this dependency order:

1. [ ] [401 — Define native Access declarations](issues/400-access/401-native-access-declarations.md)
2. [ ] [416 — Define typed Access filters](issues/400-access/416-typed-access-filters.md)
3. [ ] [417 — Compile Access plans and plugin contributions](issues/400-access/417-compiled-access-plans.md)
4. [ ] [418 — Execute the native Access lifecycle](issues/400-access/418-native-access-runtime.md)
5. [ ] [419 — Verify native Access against PostgreSQL](issues/400-access/419-native-access-postgres-e2e.md)
6. [ ] [420 — Define optional Access subject capabilities](issues/400-access/420-optional-access-capabilities.md)

Do not implement concrete CLP, ACL, or field-permission providers before issue
419 proves the neutral system against PostgreSQL. Issue 420 then supplies the
optional interoperability boundary needed by subject-aware providers.

## Provider order after the foundation

- CLP: 407 → 408.
- Field permissions: 413 → 414.
- ACL: 409 → 410 → 510 → 411 → 509 → 412.
- Independent provider composition: 415.
- Official roles: 701 → 702 → 402 → 403 → 404 → 405 → 406.

CLP and ACL do not depend on the official role implementation. Their role-aware
tests use the neutral issue 420 contract and a compatible fixture provider.

## Resume protocol

When resuming after context loss:

1. Read `AGENTS.md`, ADR-0116, this file, and the current issue completely.
2. Read the Core README and every package README in scope.
3. Inspect the working tree and preserve unrelated changes.
4. Confirm every dependency issue is `done` before changing the current issue to `in-progress`.
5. Implement one issue only, including colocated runtime and type tests, language-service coverage, documentation, and a Changeset for public API changes.
6. Run targeted checks, then the broader typecheck, tests, lint, build, packed-package, and PostgreSQL E2E checks justified by the change.
7. Create one dedicated commit after the issue is complete and never push without explicit user confirmation.
8. Show the resulting developer-facing API before proposing the next issue.

## Current issue

[401 — Define native Access declarations](issues/400-access/401-native-access-declarations.md)

## Progress log

- 401 — `ready` — Native schema and field Access declarations are specified but not implemented.
- 416 — `planned` — The restricted typed Access filter builder depends on issue 401.
- 417 — `planned` — Compiled native and plugin Access plans depend on declarations and filters.
- 418 — `planned` — Runtime Access execution depends on the compiled plan.
- 419 — `planned` — The PostgreSQL proof depends on the complete neutral Runtime lifecycle.
- 420 — `planned` — Optional subject capability contracts follow the stable contribution registry.
