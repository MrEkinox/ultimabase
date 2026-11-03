// `orderBy` in the document (D-144), named and typed as GraphQL's (D-129).
import { readable } from '@ultimabase/http/internal'
import { entryOf } from './entries.ts'
import type { Schema } from './openapi.ts'
import { described, objectOf } from './openapi.ts'
import type { Doc } from './openapi-inputs.ts'
import { searched } from './openapi-inputs.ts'

/** `PostOrderByInput`, an object or a list of them (D-94, D-134). */
export function orderByOf(doc: Doc, model: string): Schema {
	return doc.components.ref(`${model}OrderByInput`, () => {
		const order = doc.components.ref('SortOrder', () => ({
			type: 'string',
			enum: ['asc', 'desc'],
		}))
		const entry = entryOf(doc.api, model)
		const fields: { [name: string]: Schema } = {
			id: order,
			createdAt: order,
			updatedAt: order,
		}
		// The kernel refuses it in a relation's: a read ranks by its own search.
		if (searched(readable(entry))) fields['_relevance'] = order
		for (const field of readable(entry)) {
			if (field.kind === 'one')
				fields[field.name] = orderByOf(doc, field.target)
			else if (field.kind === 'many') {
				fields[field.name] = doc.components.ref('CountOrderByInput', () =>
					objectOf({ _count: order }),
				)
			} else if (
				field.type !== 'json' &&
				!field.list &&
				entry.exposed.fieldTypes[field.name] === undefined
			) {
				fields[field.name] = order
			}
		}
		return objectOf(described(fields, {}, entry.exposed.deprecations))
	})
}
