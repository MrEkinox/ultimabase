# Package-owned schema specialization

Application schemas use `Schema.define()`. A package that exposes its own final
schema factory can use the single lower-level specialization boundary to attach
typed class helpers and persisted-result commands before Core freezes the same
schema identity:

```ts
import { Schema } from '@ultimabase/core'

export const WorkflowRecord = Schema.defineSpecialized(
	{
		className: 'WorkflowRecord',
		fields: (field) => ({ state: field.string({ required: true }) }),
	},
	(context) => ({
		statics: {
			workflowKind: 'record' as const,
		},
		results: {
			assertWorkflowRecord(this: object): void {
				context.assertPersisted(this, 'assertWorkflowRecord')
			},
		},
	}),
)
```

`WorkflowRecord.workflowKind` is a non-enumerable immutable static capability.
`assertWorkflowRecord()` appears on trusted persisted results but not on drafts.
The factory may use a package-private symbol as a nominal static marker; Core
retains symbol keys without exposing them through enumeration or Typegen.

The specialization receives no application, adapter, authority, or mutable
prototype. It does not register the schema automatically: the application or
the owning plugin still declares that exact class through the ordinary schema
graph. Plugins that only add fields, options, or indexes to existing schemas
should use declaration contributions instead of creating a specialized class.
