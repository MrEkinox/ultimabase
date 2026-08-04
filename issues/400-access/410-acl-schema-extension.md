# 410: Implement the ACL schema extension

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`
- Depends on: 103, 409, 424, 425
- ADR: ADR-0002, ADR-0006, ADR-0116, ADR-0122

## Goal

Provide the typed `acl()` schema extension that injects the reserved ACL value,
derives defaults from field-resolved create candidates, and uses one input
callback for create and update. Native schema and field Access remain available
without this extension.

## Target developer experience

```ts
acl({
	default: ({ data, principal }) => {
		let value =
			data.visibility === 'public' ? new ACL().grantPublic('read') : new ACL()

		if (principal !== undefined) {
			value = value.grantPrincipal(principal, 'read', 'manageAcl')
		}

		return value
	},
	resolveInput: ({ operation, inputAcl, currentAcl }) =>
		operation === 'create' ? inputAcl : (inputAcl ?? currentAcl),
})
```

## Acceptance criteria

- [ ] The public factory is named `acl` and returns an immutable schema extension owned by `aclPlugin`.
- [ ] The extension injects one reserved, non-null ACL field without requiring developers to declare it manually.
- [ ] A default accepts either one static immutable ACL or an asynchronous factory.
- [ ] The default factory receives precisely inferred readonly field-resolved create data excluding the ACL field, the optional current principal, and HookContext.
- [ ] The generated ACL joins the candidate before structural revalidation and validation hooks; defaults cannot observe database-generated post-insert values and execute once per create-many item inside the root transaction.
- [ ] An accepted explicit ACL takes precedence over the default; ACL input is rejected by default when no input policy accepts it.
- [ ] One asynchronous `resolveInput` callback handles create and update through a discriminated `operation` and receives proposed ACL, current ACL when available, resolved row data, optional principal, and context.
- [ ] Existing ACL changes require `manageAcl` before input resolution may replace the value.
- [ ] The extension exposes per-schema limit overrides consumed by issue 428.
- [ ] `acl()` composes with `RoleSchema.define()` through the ordinary schema-extension contract without a RoleSchema-specific ACL API.
- [ ] Plugin-owned executable behavior is registered through generic extension-targeted native hooks and Access contributions; the extension value itself does not execute or teach Runtime about ACL.
- [ ] Installing no ACL extension adds no field, table, Access contribution, transport input, or runtime stage.

## Tests

- [ ] Type, language-service, static/async default, resolved-data, create/update callback, create-many, ownership, missing-plugin, and configuration-normalization tests.
