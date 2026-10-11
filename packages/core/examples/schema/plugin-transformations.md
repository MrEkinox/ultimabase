# Additive plugin schema contributions

Plugins extend the logical application graph through a pure synchronous
declaration contribution. It receives no adapter, request, clock, service, or
application resource at this boundary.

```ts
import { UltimaBase, stringField } from '@ultimabase/core'
import {
	addSchemaField,
	addSchemaIndex,
	contributeDeclarations,
	defineSchemaOption,
	plugin,
} from '@ultimabase/core/plugin'

const workflowOption = defineSchemaOption({
	normalize(value, path) {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('enabled' in value) ||
			typeof value.enabled !== 'boolean'
		) {
			throw new TypeError(`${path}.enabled must be a boolean`)
		}

		return { enabled: value.enabled }
	},
	protocolVersion: 1,
	typegen: {
		module: '@example/workflow-plugin',
		type: 'WorkflowSchemaOption',
	},
})

const AuditLog = UltimaBase.Schema.define({
	className: 'WorkflowAuditLog',
	fields: (field) => ({ message: field.string() }),
})

export const workflowPlugin = plugin({
	id: '@example/workflow-plugin',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [
		contributeDeclarations({
			schema({ schemas }) {
				schemas.defineOptions({
					contributionId: 'workflow-options',
					schema: { workflow: workflowOption },
				})

				schemas.add({
					contributionId: 'workflow-audit-log',
					schema: AuditLog,
				})

				const contentSchemas = schemas.select({
					option: { name: 'workflow', path: ['enabled'], equals: true },
					owner: { kind: 'application' },
				})

				schemas.patch({
					targets: contentSchemas,
					operations: [
						addSchemaField({
							contributionId: 'workflow-state',
							name: 'workflowState',
							field: stringField({ default: 'pending', required: true }),
							mutationInput: 'forbidden',
						}),
						addSchemaIndex({
							contributionId: 'workflow-state-index',
							fields: ['workflowState', 'createdAt'],
						}),
					],
				})
			},
		}),
	],
})
```

`mutationInput: 'forbidden'` keeps `workflowState` in stored objects, selections,
filters, snapshots, and migration intent while removing it from every caller
mutation input. Only a provenance-checked plugin-owned effect may change it.

Selectors observe only the graph completed by earlier plugins. All their targets
freeze before the current plugin applies its first patch, so an addition cannot
self-expand a later selection from the same callback.

`{ option: { name } }` matches direct-option presence, while
`{ option: { name, present: false } }` matches omission only. An explicit
`false` remains a present value. The absence form is deliberately not a general
negation language and cannot be combined with `equals` or `path`.

Additions require `schema:declare` and keep their owner and contribution ID.
Existing fields, indexes, constraints, and option values cannot be replaced,
renamed, or removed by a plugin patch. Duplicate additions fail. Core system
fields remain protected.

If no installed descriptor owns a used direct option, compilation fails. If two
plugins claim the same option name, compilation also fails rather than selecting
one by registration order. Installing an unused descriptor has no effect.

An option may declare a Runtime compiler when its behavior belongs to a
versioned application capability. Core records used normalized occurrences
during static compilation, but does not invoke them from
`ultimabase.compile()` or Typegen. Real application initialization
materializes capabilities, invokes these compilers with a frozen context such as
the class name, field name, option name, value, and provenance, and only then
runs plugin setup. The compiler returns `undefined` and registers through its
exact owner-bound capability; Core does not retain a generic Runtime result.

The final `schema.definition.provenance` snapshot records the source of schemas,
fields, options, indexes, portable constraints, and patches. It is
inert logical metadata: Typegen may render its declarations and migration
plugins may later compare persisted snapshots, but Core does not infer renames
or destructive cleanup.

Every declaration registry belongs to one application. Reusing a stable schema
class in another application succeeds only when its complete compiled graph is
compatible. An incompatible plugin set fails without mutating, rebinding, or
silently cleaning the class compiled by the first application.

Typegen will provide application-specific autocomplete for direct plugin options.
Until that generated declaration is present, a TypeScript application may model
the same direct property through an explicit local intersection; JavaScript uses
the identical runtime validation without generated artifacts.

## Dynamic schemas and application handles

Plugin-owned schemas remain accessible through application-owned handles:

```ts
const AuditEntry = ultimabase.schema('WorkflowAuditLog')
const entry = await AuditEntry.schema.findOne({ where: { id: entryId } })
```

To add an item-oriented command, declare a `defineSchemaMutation` token and
attach it through `models.extend(target, { contributionId, schemaMutations })`.
For example, `schemaMutations: { archive: { mutation: archiveMutation,
surfaces: ['schema'] } }` exposes the declared mutation on the schema class and
handle; results have no methods (ADR-0310). The handler separately supplies its owner-only
effect. Core retains policy checks, locked targets, and automatic transactions.

Application operations remain available through
`ultimabase.operation(token).execute(input)`. There is no arbitrary operation
command map on schema/model handles.

## Canonical compilation

Core owns the canonical compiler. It applies ordered declarations, frozen
selectors, and additive patches, then validates the complete graph before
publication. Plugins cannot replace the compiler. Opaque artifacts retain exact
identity and ownership; Typegen reads the resulting inert facts without running
application callbacks.

## Portable and opaque option selection

Use `{ option: { name: 'workflow', path: ['enabled'], equals: true } }` when the
normalized option is portable JSON. Presence (`{ option: { name: 'workflow' } }`)
and absence (`{ option: { name: 'workflow', present: false } }`) also work for
opaque values. If the value contains a callback, equality and path selectors do
not match it; they never inspect the callback, its surrounding object or any
internal marker. This depends on the normalized value, not solely on the option
contract's `valueKind` setting. Core preserves the same frozen selection targets
and validates the complete graph before publishing any schema contributions.
