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
			validation: {
				required: true,
				length: { min: 3, max: 32 },
			},
		}),
		active: field.boolean({ default: true }),
		status: field.enum({
			values: ['invited', 'active', 'disabled'],
			default: 'invited',
		}),
		profile: field.object({
			fields: (field) => ({
				displayName: field.string({
					validation: { length: { max: 80 } },
				}),
				birthday: field.date(),
			}),
		}),
	}),
})
```

The callback runs once during application static compilation. Builder calls
reuse the existing immutable field factories, so the same validation, defaults,
plugin option namespaces, and metadata apply. The embedded builder intentionally has no
`pointer` or `relation` methods and does not accept `autoIncrement: true`.

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
		title: field.string({ validation: { required: true } }),
		author: field.pointer({
			target: 'User',
			validation: { required: true },
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
		title: field.string({ validation: { required: true } }),
		embedding: field.vector({
			dimensions: 1536,
			validation: { required: true },
		}),
	}),
})

const application = await createApplication({
	schemas: [DocumentSchema],
	plugins: [pgVectorPlugin()],
})
```

The method belongs to this application's plugin graph. Another application
without `pgVectorPlugin()` does not register it. Once the generated declaration
is included by TypeScript, its module augmentation exposes `field.vector()` on
this application's FieldBuilder. Core's unaugmented base type remains neutral.
Applications regenerate that declaration through `typegenPlugin()` during
startup. A future CLI will expose manual generation and watch mode.

The same map-returning declaration is used by applications, tests, and
framework-owned schemas. The generated application registry provides exact
model, Query, mutation, Access, hook, extension, object-path, pointer, and
relation contracts for builder-declared schemas without recursive field-map
inference.
