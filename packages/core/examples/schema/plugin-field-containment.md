# Community plugin field containment

A community field can opt into portable structural `contains` without adding a
custom Query operator or leaking its callbacks to an adapter. The field must be
scalar and provide a complete-value JSON storage codec. Its containment
snapshot is a separate partial contract:

```ts
import {
	contributeDeclarations,
	definePluginFieldFamily,
	definePluginField,
	plugin,
	type FieldOptions,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

export interface SearchDocument {
	readonly body: string
	readonly tags: readonly string[]
}

export interface SearchContainsOperand {
	readonly body?: string
	readonly tags?: readonly string[]
}

const snapshotDocument = (value: unknown, path: string): SearchDocument => {
	if (!isPlainRecord(value) || typeof value.body !== 'string') {
		throw new TypeError(`${path} must contain a body`)
	}
	if (
		!Array.isArray(value.tags) ||
		!value.tags.every((tag) => typeof tag === 'string')
	) {
		throw new TypeError(`${path}.tags must contain only strings`)
	}
	return immutableRecord({ body: value.body, tags: value.tags })
}

const snapshotContains = (
	value: unknown,
	path: string,
): SearchContainsOperand => {
	if (!isPlainRecord(value)) throw new TypeError(`${path} must be an object`)
	if (value.body !== undefined && typeof value.body !== 'string') {
		throw new TypeError(`${path}.body must be a string`)
	}
	if (
		value.tags !== undefined &&
		(!Array.isArray(value.tags) ||
			!value.tags.every((tag) => typeof tag === 'string'))
	) {
		throw new TypeError(`${path}.tags must contain only strings`)
	}
	return immutableRecord({
		...(value.body === undefined ? {} : { body: value.body }),
		...(value.tags === undefined ? {} : { tags: value.tags }),
	})
}

export const searchDocumentField = (
	options: FieldOptions<SearchDocument> = {},
) =>
	definePluginField('community.search.document', options, {
		snapshotValue: snapshotDocument,
		storageCodec: {
			decode: (value) => snapshotDocument(value, 'stored search document'),
			encode: (value) => value,
			format: 'json',
			version: 1,
		},
		structuralContains: { snapshotOperand: snapshotContains },
	})

export type SearchDocumentFieldBuilderMethod = typeof searchDocumentField

const family = definePluginFieldFamily({
	fieldKind: 'community.search.document',
	typegen: {
		module: '@community/search-document-plugin',
		structuralContainsType: 'SearchContainsOperand',
		valueType: 'SearchDocument',
	},
	builder: {
		name: 'searchDocument',
		contexts: {
			stored: {
				factory: searchDocumentField,
				methodType: 'SearchDocumentFieldBuilderMethod',
			},
		},
	},
})

export const searchDocumentPlugin = () =>
	plugin({
		id: '@community/search-document-plugin',
		version: '1.0.0',
		core: '^0.0.0',
		permissions: {
			'schema:declare': 'Adds the search document field.',
		},
		contributions: [
			contributeDeclarations({
				schema: ({ fields }) => {
					fields.register(family)
					return undefined
				},
			}),
		],
	})
```

Once Typegen has emitted the application declaration, developers receive the
exact partial operand on the ordinary Query surface:

Before generation, configured source typing only exposes that `contains` is
available; it does not treat the snapshot callback's normalized return value
as the accepted developer input. The generated `WhereInput` uses the field
family's public `structuralContainsType` reference for the exact input shape.

```ts
const Posts = ultimabase.schema(PostSchema)

await Posts.findMany({
	where: {
		search: { contains: { tags: ['typescript'] } },
	},
})
```

Core invokes `snapshotContains`, then independently validates, detaches, and
freezes its JSON result. The resulting AST is the existing `contains` leaf.
Database adapters never receive the callback and must advertise
`databasePluginFieldStructuralContainsCapability` before Core sends such a
query. A JSON storage codec alone continues to grant only complete-value
equality.
