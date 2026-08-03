import { Schema, stringField } from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import type { CreateOneOperationAst } from '../../query/index.js'
import {
	afterOperation,
	beforeOperation,
	postCommitEvent,
	type AfterOperationDefinition,
	type BeforeOperationDefinition,
	type PostCommitEventDefinition,
} from './definitions.js'

const articleSchema = Schema.define({
	className: 'TypedHookArticle',
	fields: { title: stringField({ validation: { required: true } }) },
})

test('infers schema and operation discriminants inside contribution handlers', () => {
	const before = beforeOperation({
		schema: articleSchema,
		operations: ['create-one'] as const,
		handler: (input) => {
			expectTypeOf(input.context.requestId).toBeString()
			expectTypeOf(input.context.transactionId).toEqualTypeOf<
				string | undefined
			>()
			expectTypeOf(input.context.signal).toEqualTypeOf<AbortSignal>()
			expectTypeOf(input.context.access.mode).toEqualTypeOf<
				'anonymous' | 'master'
			>()
			// @ts-expect-error -- Low-level hooks never receive private request metadata.
			void input.context.metadata
			expectTypeOf(input.operation).toEqualTypeOf<
				CreateOneOperationAst<typeof articleSchema>
			>()
			expectTypeOf(input.operation.input.title).toBeString()

			return { operation: input.operation }
		},
	})
	const after = afterOperation({
		schema: articleSchema,
		operations: ['create-one'] as const,
		handler: (input) => ({ result: input.result }),
	})
	const event = postCommitEvent({
		schema: articleSchema,
		operations: ['create-one'] as const,
		handler: (input) => {
			expectTypeOf(input.operation.kind).toEqualTypeOf<'create-one'>()
		},
	})

	expectTypeOf(before).toEqualTypeOf<
		BeforeOperationDefinition<typeof articleSchema, 'create-one'>
	>()
	expectTypeOf(after).toEqualTypeOf<
		AfterOperationDefinition<typeof articleSchema, 'create-one'>
	>()
	expectTypeOf(event).toEqualTypeOf<
		PostCommitEventDefinition<typeof articleSchema, 'create-one'>
	>()
})

test('rejects unknown operation kinds and implicit hook mutations', () => {
	beforeOperation({
		schema: articleSchema,
		// @ts-expect-error -- Hook operation filters use terminal discriminants.
		operations: ['save'],
		handler: (input) => ({ operation: input.operation }),
	})

	beforeOperation({
		schema: articleSchema,
		operations: ['create-one'],
		// @ts-expect-error -- Before-hooks must return an explicit operation wrapper.
		handler: (input) => input.operation,
	})

	afterOperation({
		schema: articleSchema,
		operations: ['create-one'],
		// @ts-expect-error -- After-hooks must return an explicit result wrapper.
		handler: (input) => input.result,
	})
})
