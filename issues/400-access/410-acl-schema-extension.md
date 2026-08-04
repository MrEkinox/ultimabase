# 410: Implement the ACL schema extension

- Status: done
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`
- Depends on: 103, 409, 424, 425
- ADR: ADR-0002, ADR-0006, ADR-0116, ADR-0122

## Goal

Provide the typed `acl()` schema extension that injects the reserved ACL value
and derives create defaults from field-resolved candidates. The extension also
declares the shared create/update input callback consumed by issue 411, where
trusted master authority is enforced before explicit ACL input. Native schema
and field Access remain available without this extension.

## Target developer experience

```ts
acl({
	default: ({ data, principal }) => {
		let value =
			data.visibility === 'public' ? new ACL().grantPublic('read') : new ACL()

		if (principal !== undefined) {
			value = value.grantPrincipal(principal, 'read', 'update')
		}

		return value
	},
	resolveInput: ({ operation, inputAcl, currentAcl }) =>
		operation === 'create' ? inputAcl : (inputAcl ?? currentAcl),
})
```

## Acceptance criteria

- [x] The public factory is named `acl` and returns an immutable schema extension owned by `aclPlugin`.
- [x] The extension injects one reserved, non-null ACL field without requiring developers to declare it manually.
- [x] A default accepts either one static immutable ACL or an asynchronous factory.
- [x] The default factory receives a precise generic readonly field-resolved create-data contract excluding the ACL field, the optional current principal, and HookContext.
- [x] The generated ACL joins the candidate before structural revalidation and validation hooks; defaults cannot observe database-generated post-insert values and execute once per create-many item inside the root transaction.
- [x] An accepted explicit ACL takes precedence over the default; ACL input is rejected by default when no input policy accepts it.
- [x] One asynchronous `resolveInput` contract discriminates create and update and carries proposed ACL, current ACL when available, resolved row data, optional principal, and context. Issue 411 executes explicit ACL input only under trusted master authority.
- [x] The extension exposes per-schema limit overrides consumed by issue 428.
- [x] `acl()` composes with `RoleSchema.define()` through the ordinary schema-extension contract without a RoleSchema-specific ACL API.
- [x] Plugin-owned create behavior is registered through generic extension-targeted native hooks; the extension value itself does not execute or teach Runtime about ACL.
- [x] Installing no ACL extension adds no field, table, Access contribution, transport input, or runtime stage.

## Tests

- [x] Type, language-service, static/async default, resolved-data, create callback, create-many, ownership, missing-plugin, and configuration-normalization tests.
- [x] Issue 411 verifies update callback ordering and master-only ACL management.
