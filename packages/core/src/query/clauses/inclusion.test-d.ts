import { pointerField, Schema, stringField } from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import { QueryBuilder } from '../query/query.js'
import {
	normalizeQueryInclusion,
	type QueryPointerFieldName,
	type QueryPointerTargetSchema,
} from './inclusion.js'

const userSchema = Schema.define({
	className: 'TypedIncludedUser',
	fields: { name: stringField() },
})
const postSchema = Schema.define({
	className: 'TypedIncludedPost',
	fields: {
		author: pointerField({ target: () => userSchema }),
		title: stringField(),
	},
})

test('correlates pointer keys with their exact target query', () => {
	expectTypeOf<
		QueryPointerFieldName<typeof postSchema>
	>().toEqualTypeOf<'author'>()
	expectTypeOf<
		QueryPointerTargetSchema<typeof postSchema, 'author'>
	>().toEqualTypeOf<typeof userSchema>()

	const inclusion = normalizeQueryInclusion(postSchema, [
		{
			field: 'author',
			query: new QueryBuilder(userSchema).select({ name: true }).ast,
		},
	])

	expectTypeOf(inclusion.pointers[0]?.field).toEqualTypeOf<
		'author' | undefined
	>()

	normalizeQueryInclusion(postSchema, [
		{
			// @ts-expect-error -- Scalar fields cannot enter pointer inclusion.
			field: 'title',
			query: new QueryBuilder(userSchema).ast,
		},
	])
})
