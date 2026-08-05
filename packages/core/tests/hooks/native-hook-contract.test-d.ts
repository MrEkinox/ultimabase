import { describe, expectTypeOf, it } from 'vitest'

import type {
	InferCreateInput,
	InferObject,
	InferUpdateInput,
} from '../../src/index.js'
import {
	emailField,
	embeddingField,
	matrixField,
	nullableField,
	profileField,
	statusField,
} from './native-hook-contract.prototype.js'
import type {
	PostSchema,
	PrototypeBeforeFindHook,
} from './native-hook-contract.prototype.js'

const preserveSelection = (({ query }) =>
	query.limit(25)) satisfies PrototypeBeforeFindHook<typeof PostSchema>

describe('native hook contract prototype', () => {
	it('preserves schema and field inference outside callback declarations', () => {
		expectTypeOf<InferCreateInput<typeof PostSchema>>().toEqualTypeOf<{
			email?: string | null
			status?: 'draft' | 'published' | null
			title: string
			views?: number | null
		}>()
		expectTypeOf<InferUpdateInput<typeof PostSchema>>().toEqualTypeOf<{
			email?: string | null
			status?: 'draft' | 'published' | null
			title?: string
			views?: number | null
		}>()
		expectTypeOf<InferObject<typeof PostSchema>>().toEqualTypeOf<{
			readonly createdAt: string
			readonly email: string | null
			readonly id: string
			readonly status: 'draft' | 'published' | null
			readonly title: string
			readonly updatedAt: string
			readonly views: number | null
		}>()

		expectTypeOf(emailField.options).not.toHaveProperty('hooks')
		expectTypeOf(statusField.options).not.toHaveProperty('hooks')
		expectTypeOf(profileField.options).not.toHaveProperty('hooks')
		expectTypeOf(matrixField.options).not.toHaveProperty('hooks')
		expectTypeOf(nullableField.options).not.toHaveProperty('hooks')
		expectTypeOf(embeddingField.options).not.toHaveProperty('hooks')
		expectTypeOf(preserveSelection).toExtend<
			PrototypeBeforeFindHook<typeof PostSchema>
		>()
	})
})
