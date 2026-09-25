import { expectTypeOf, test } from 'vitest'

import {
	defineOperationValue,
	defineSchemaMutation,
	type PluginSchemaMutationHandlerInput,
} from '../../index.js'
import {
	provideSchemaMutationHandler,
	schemaMutationHandler,
} from './capabilities.js'

const update = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input: defineOperationValue((value: unknown) => String(value)),
	name: 'fixture.schema-mutation-types.update',
	returning: 'after',
	version: '1.0.0',
})
const remove = defineSchemaMutation({
	authority: 'master',
	effect: 'delete',
	input: defineOperationValue((): undefined => undefined),
	name: 'fixture.schema-mutation-types.delete',
	returning: 'before',
	version: '1.0.0',
})

test('preserves exact mutation input and effect result contracts', () => {
	const updateHandler = schemaMutationHandler({
		mutation: update,
		resolve: (input) => {
			expectTypeOf(input).toEqualTypeOf<
				PluginSchemaMutationHandlerInput<typeof update>
			>()
			expectTypeOf(input.input).toEqualTypeOf<string>()
			return { data: { state: 'archived' } }
		},
	})
	const deleteHandler = schemaMutationHandler({
		mutation: remove,
		resolve: ({ input }) => {
			expectTypeOf(input).toEqualTypeOf<undefined>()
			return undefined
		},
	})

	expectTypeOf(
		provideSchemaMutationHandler({
			contributionId: 'update',
			create: () => ({ value: updateHandler }),
		}),
	).not.toBeNever()
	expectTypeOf(deleteHandler.mutation).toEqualTypeOf<typeof remove>()

	// @ts-expect-error -- Delete handlers cannot manufacture update effects.
	schemaMutationHandler({ mutation: remove, resolve: () => ({ data: {} }) })
})
