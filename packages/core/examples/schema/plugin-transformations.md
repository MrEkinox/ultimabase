# Plugin schema transformations

Plugins extend the logical application graph during the pure synchronous
`declare` phase. They receive no adapter, request, clock, service, or setup
resource at this boundary.

```ts
import {
	Schema,
	addSchemaField,
	addSchemaIndex,
	definePlugin,
	defineSchemaOption,
	replaceSchemaField,
	stringField,
} from '@ultimabase/core'

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

const AuditLog = Schema.define({
	className: 'WorkflowAuditLog',
	fields: (field) => ({ message: field.string() }),
})

export const workflowPlugin = definePlugin({
	pluginId: '@example/workflow-plugin',
	version: '1.0.0',
	core: '^0.0.0',
	privileges: [
		{
			name: 'schema:declare',
			reason: 'Adds workflow metadata and logical fields.',
		},
	],
	declare({ schemas }) {
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
					field: stringField({ validation: { required: true } }),
				}),
				addSchemaIndex({
					contributionId: 'workflow-state-index',
					fields: ['workflowState', 'createdAt'],
				}),
			],
		})
	},
})
```

An ordinary cross-owner replacement additionally names the exact prior owner,
stable contribution identity, and expected immutable shape:

```ts
const Article = Schema.define({
	className: 'Article',
	fields: (field) => ({ title: field.string() }),
})
const originalTitle = Article.fields.title

const requiredTitlePlugin = definePlugin({
	pluginId: '@example/required-title-plugin',
	version: '1.0.0',
	core: '^0.0.0',
	privileges: [
		{
			name: 'schema:transform',
			reason: 'Requires the exact application-owned Article title.',
		},
	],
	declare({ schemas }) {
		schemas.patch({
			targets: schemas.select({ className: 'Article' }),
			operations: [
				replaceSchemaField({
					contributionId: 'required-title',
					name: 'title',
					field: stringField({ validation: { required: true } }),
					target: {
						owner: { kind: 'application' },
						contributionId: 'field:Article.title',
						expected: originalTitle,
					},
				}),
			],
		})
	},
})
```

Selectors observe only the graph completed by earlier plugins. All their targets
freeze before the current plugin applies its first patch, so an addition cannot
self-expand a later selection from the same callback.

An addition needs `schema:declare`. Changing or removing an existing contribution
needs `schema:transform` and an exact target containing the prior owner, stable
contribution ID, and expected immutable shape. A stale target fails instead of
retargeting a similarly named field. Schema class names and Core-owned `id`,
`createdAt`, and `updatedAt` fields are protected from ordinary transforms.

If no installed descriptor owns a used direct option, compilation fails. If two
plugins claim the same option name, compilation also fails rather than selecting
one by registration order. Installing an unused descriptor has no effect.

An option may declare a Runtime compiler when its behavior belongs to a
versioned application capability. Core records used normalized occurrences
during static compilation, but does not invoke them from
`application.compileSchemas()` or Typegen. Real application initialization
materializes capabilities, invokes these compilers with a frozen context such as
the class name, field name, option name, value, and provenance, and only then
runs plugin setup. The compiler returns `undefined` and registers through its
exact owner-bound capability; Core does not retain a generic Runtime result.

The final `schema.definition.provenance` snapshot records the source of schemas,
fields, options, indexes, portable constraints, extensions, and patches. It is
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

A plugin may attach surfaces directly to a schema class it declares in the same
static callback. Existing schemas instead use frozen selectors. Both resolve
through one application-owned handle and neither path changes an exported class
or prototype:

```ts
const WorkflowAuditEntry = Schema.define({
	className: 'WorkflowAuditEntry',
	fields: (field) => ({ message: field.string() }),
})

declare({ models, operations, schemas }) {
	schemas.add({
		contributionId: 'workflow-audit-entry',
		schema: WorkflowAuditEntry,
	})
	operations.declare(publishWorkflowEntry)
	models.extend(WorkflowAuditEntry, {
		contributionId: 'workflow-audit-commands',
		modelCommands: { publish: publishWorkflowEntry },
	})
}

const AuditEntry = ultimabase.schema('WorkflowAuditEntry')
const entry = await AuditEntry.findOne({ where: { id: entryId } })
const published = await entry.publish(input)

// Dynamic tooling can still inspect or execute an operation handle by name.
const envelope = AuditEntry.for(entry).command(commandName).prepare(input)
```

`prepare()` only validates the immutable logical envelope. Direct model methods
execute through the same operation contract and active `RequestEngine`; neither
path mutates the dynamic schema class or its prototype.

## Complete compiler protocol

Complete compiler implementations use the separately versioned callback-free IR
rather than receiving `Schema` classes, field callbacks, or Core registries:

```ts
import {
	schemaCompilerProtocolVersion,
	type SchemaCompilerInput,
	type SchemaCompilerOutput,
} from '@ultimabase/core'

const preserveDeclaredGraph = (
	input: SchemaCompilerInput,
): SchemaCompilerOutput =>
	Object.freeze({
		protocolVersion: schemaCompilerProtocolVersion,
		selections: Object.freeze(
			input.declarations.flatMap(({ selections }) =>
				selections.map(({ selectionId }) =>
					Object.freeze({ classNames: Object.freeze([]), selectionId }),
				),
			),
		),
		schemas: Object.freeze([
			...input.schemas,
			...input.declarations.flatMap(({ additions }) =>
				additions.map(({ schema }) => schema),
			),
		]),
	})
```

The real compiler must also include plugin-added schemas from the ordered
declaration batches and apply their selectors and patches. Runtime-bearing
fields, extensions, option definitions, default factories, plugin-owned
behaviors and policies, and schema classes appear only as nominal artifact
references. A compiler may
preserve and arrange those declared references but cannot resolve them or invent
another application's artifacts. Core owns decoding and final invariant
validation. Installing a replacement compiler remains owned by issue 1418; the
IR contract alone adds no post-compilation transform or replacement path.

Each addition retains its contribution ID and normalized static options.
Extension nodes expose their logical field nodes beside the opaque extension
identity, so a compiler can apply their complete declared effect without a
resolver. Every option independently attributes its defining contract and its
current value contributor.
