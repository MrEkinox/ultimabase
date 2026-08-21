# Milestone 19 — Direct plugin schema configuration

- Status: in-progress

Remove the generic `extensions` containers from schemas and fields now that the
public plugin kernel has more precise contribution mechanisms. Plugin-owned
schema and field options carry configuration, plugin fields carry distinct
logical values, schema patches carry structural transformations, and
capabilities connect plugins without extension-specific selectors.

The target developer experience uses direct options that are recognized,
validated, documented, and generated only when their owning plugin is present:

```ts
const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({
			postgres: { renamedFrom: 'headline' },
		}),
	}),
	postgres: { table: 'posts' },
	acl: { default: new ACL() },
})
```

UltimaBase is still in development, so the milestone deliberately provides no
deprecated aliases, compatibility adapters, or period where both syntaxes are
accepted. Every migration removes the superseded API and all of its exports in
the same issue.

## Execution order

1. [x] [1901 — Decide the direct replacement and removal boundary](1901-direct-plugin-configuration-adr.md)
2. [x] [1902 — Add option-presence schema selection](1902-option-presence-schema-selection.md)
3. [ ] [1903 — Migrate ACL to a direct schema option](1903-direct-acl-schema-option.md)
4. [ ] [1904 — Migrate PostgreSQL metadata to direct options](1904-direct-postgres-options.md)
5. [ ] [1905 — Replace the RoleSchema extension marker](1905-role-schema-identity.md)
6. [ ] [1906 — Remove schema and field extensions](1906-remove-schema-field-extensions.md)
7. [ ] [1907 — Verify the extension-free public vertical](1907-extension-free-verification.md)

Issues are ordered so the one structural behavior currently unique to schema
extensions—adding reserved ACL storage—reuses an option-presence selector and
ordinary patch before ACL migrates. PostgreSQL and Roles then leave the old representation before Core,
Typegen, Plugin Kit, official authoring helpers, and documentation delete it.

## Deliberate boundaries

- Query surface extensions are not part of this milestone; they are callable
  application-handle methods rather than schema metadata containers.
- Plugin-defined logical fields remain unchanged.
- The milestone does not introduce a generic metadata bag under another name.
- Historical ADRs and completed issues retain their original terminology.
