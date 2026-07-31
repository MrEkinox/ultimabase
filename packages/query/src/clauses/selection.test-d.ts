import { booleanField, defineSchema, stringField } from '@ultimabase/schema'
import { expect, expectTypeOf, test } from 'vitest'

import { normalizeQuerySelection } from './selection.js'

const postSchema = defineSchema({
	className: 'Post',
	fields: {
		title: stringField(),
		published: booleanField(),
	},
})

test('correlates selected fields with developer and framework schema fields', () => {
	const selection = normalizeQuerySelection(postSchema, [
		'title',
		'id',
		'updatedAt',
	])

	expect(selection.kind).toBe('selection')
	expectTypeOf<(typeof selection.fields)[number]['field']>().toEqualTypeOf<
		'title' | 'published' | 'id' | 'createdAt' | 'updatedAt'
	>()

	// @ts-expect-error -- Unknown fields never enter a schema-correlated selection.
	normalizeQuerySelection(postSchema, ['missing'])
	// @ts-expect-error -- Normalized selections are immutable.
	selection.fields = []
	// @ts-expect-error -- Normalized field collections are immutable.
	selection.fields[0] = { kind: 'selected-field', field: 'title' }
})
