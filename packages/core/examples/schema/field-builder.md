# FieldBuilder declarations

`fields: (field) => ({ ... })` is the canonical declaration. The returned map
owns logical field names, while every method accepts the existing field-factory
options:

```ts
import { Schema } from '@ultimabase/core'

export const UserSchema = Schema.define({
	className: 'User',
	fields: (field) => ({
		username: field.string({
			indexed: 'unique',
			required: true,
		}),
		active: field.boolean({ default: true }),
		status: field.enum({
			values: ['invited', 'active', 'disabled'],
			default: 'invited',
		}),
		profile: field.object({
			fields: (field) => ({
				displayName: field.string(),
				birthday: field.date(),
			}),
		}),
	}),
})
```

The callback runs once during application static compilation. Builder calls
reuse the existing immutable field factories. The embedded builder has its own
context-specific option types: it keeps value behavior such as `required`,
`default`, `list`, `immutable`, and temporal `autoNow`, but has no `pointer` or
`relation` method and does not expose portable `indexed`, system generation, or
integer `autoIncrement` options.

Literal field names cannot shadow framework system fields (`id`, `createdAt`,
`updatedAt`), Query logical keys (`AND`, `OR`, `NOT`), or model capabilities
such as `create`, `get`, `relation`, `then`, and `toJSON`. TypeScript rejects
these names directly in `Schema.define()`, and the same runtime guard protects
dynamically assembled field maps and plugin contributions.

Relationship targets use stable schema names and resolve to exact registered
classes during application compilation:

```ts
const PostSchema = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		author: field.pointer({
			target: 'User',
			required: true,
		}),
	}),
})
```

Framework and plugin authors can continue to compose the low-level immutable
field factories internally. A general `field.custom()` is deliberately not
part of the application API.

Configured plugins may add equally concise methods. For example,
`pgVectorPlugin()` contributes `field.vector()` before schema compilation:

```ts
const DocumentSchema = Schema.define({
	className: 'Document',
	fields: (field) => ({
		title: field.string({ required: true }),
		embedding: field.vector({
			dimensions: 1536,
			required: true,
		}),
	}),
})

const Application = UltimaBase.use(pgVectorPlugin())

const application = await new Application({
	schemas: [DocumentSchema],
}).initialize()
```

The method belongs to this application's plugin graph. Another application
without `pgVectorPlugin()` does not register it. Once the generated declaration
is included by TypeScript, its module augmentation exposes `field.vector()` on
this application's stored FieldBuilder. The plugin declares `stored` explicitly;
its storage and wire codecs do not silently make `vector()` valid inside an
embedded object or an output descriptor.

Plugin methods may implement any non-empty subset of the closed `stored`,
`embedded`, `virtual`, and `output` contexts. Each supported context supplies
its own exact factory and Typegen method reference. Direct field options follow
the same rule through `defineFieldOption({ contexts, ... })`. Core's unaugmented
base types remain neutral, and stale or untyped use in an unsupported context
fails during application compilation before setup. Applications regenerate the
exact contextual declarations through `typegenPlugin()` during startup. A
future CLI will expose manual generation and watch mode.

The same map-returning declaration is used by applications, tests, and
framework-owned schemas. The generated application registry provides exact
model, Query, mutation, plugin-owned option, extension, object-path, pointer,
and relation contracts for builder-declared schemas without recursive
field-map inference.
