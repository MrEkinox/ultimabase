import { defineSchema, stringField } from '@ultimabase/schema'
import { expect, expectTypeOf, test } from 'vitest'

import {
	createQueryCursorPayload,
	normalizeQueryOrdering,
	sealQueryCursor,
	type QueryCursor,
	type QueryCursorCodec,
	type QueryCursorPayload,
	type QueryCursorValues,
} from '../index.js'

const postSchema = defineSchema({
	className: 'Post',
	fields: {
		title: stringField(),
	},
})

test('keeps cursor payload fields correlated with the schema', () => {
	const ordering = normalizeQueryOrdering(postSchema, [
		{ field: 'title', direction: 'ascending' },
	])
	const values = {
		title: 'UltimaBase',
		id: '019b89dd-example',
	} satisfies QueryCursorValues<typeof postSchema>
	const payload = createQueryCursorPayload(postSchema, ordering, values)
	const synchronousCodec = {
		seal: () => 'opaque.cursor',
		unseal: () => payload,
	} satisfies QueryCursorCodec
	const asynchronousCodec = {
		seal: () => Promise.resolve('opaque.cursor'),
		unseal: () => Promise.resolve(payload),
	} satisfies QueryCursorCodec

	expect(payload.className).toBe('Post')
	expectTypeOf(payload).toExtend<
		QueryCursorPayload<'title' | 'id' | 'createdAt' | 'updatedAt'>
	>()
	expectTypeOf(sealQueryCursor(synchronousCodec, payload)).toEqualTypeOf<
		Promise<QueryCursor>
	>()
	expectTypeOf(asynchronousCodec).toExtend<QueryCursorCodec>()

	const invalidValues = {
		// @ts-expect-error -- Cursor values only accept fields from the schema.
		missing: 'unknown',
	} satisfies QueryCursorValues<typeof postSchema>

	expect(invalidValues.missing).toBe('unknown')
	// @ts-expect-error -- Payload ordering collections are immutable.
	payload.ordering = []
})
