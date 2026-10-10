# Package-owned schema specialization

Application schemas use `App.Schema.define()`. A package that exposes its own final
schema factory can use the single lower-level specialization boundary to attach
typed static helpers before Core freezes the same schema identity:

```ts
import { Schema } from '@ultimabase/core'

export const WorkflowRecord = Schema.defineSpecialized(
	{
		className: 'WorkflowRecord',
		fields: (field) => ({ state: field.string({ required: true }) }),
	},
	() => ({ workflowKind: 'record' as const }),
)
```

`WorkflowRecord.workflowKind` is a non-enumerable immutable static capability.
Results stay frozen plain data: a specialization cannot add result methods
(ADR-0310). The factory may use a package-private symbol as a nominal static marker; Core
retains symbol keys without exposing them through enumeration or Typegen.

The specialization receives no application, adapter, authority, or mutable
prototype. It does not register the schema automatically: the application or
the owning plugin still declares that exact class through the ordinary schema
graph. Plugins that only add fields, options, or indexes to existing schemas
should use declaration contributions instead of creating a specialized class.
