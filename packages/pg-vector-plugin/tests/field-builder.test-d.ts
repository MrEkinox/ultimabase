import { expectTypeOf, test } from 'vitest'

import type { FieldBuilder } from '@ultimabase/core'

import {
	pgVectorPlugin,
	type PgVectorPlugin,
	type VectorFieldBuilderMethod,
	type VectorValue,
} from '../src/index.js'

declare const generatedField: FieldBuilder & {
	readonly vector: VectorFieldBuilderMethod
}

test('types the generated vector method with the existing exact options', () => {
	generatedField.vector('embedding', {
		dimensions: 3,
		validation: { required: true },
		hooks: {
			resolveInput: ({ value }) => {
				expectTypeOf(value).toEqualTypeOf<VectorValue | null>()

				return value
			},
		},
	})

	generatedField.vector('embeddings', {
		dimensions: 3,
		list: true,
	})

	// @ts-expect-error -- Dimensions remain numeric metadata.
	generatedField.vector('invalidDimensions', { dimensions: 'three' })
	generatedField.vector('invalidDefault', {
		dimensions: 2,
		// @ts-expect-error -- Defaults retain the vector's numeric value type.
		default: ['one', 'two'],
	})
	generatedField.vector('invalidNullable', {
		dimensions: 2,
		validation: {
			// @ts-expect-error -- Nullability remains derived from required presence.
			nullable: true,
		},
	})
})

test('keeps plugin methods generated rather than globally augmenting Core', () => {
	expectTypeOf<FieldBuilder>().not.toHaveProperty('vector')
	expectTypeOf(pgVectorPlugin()).toEqualTypeOf<PgVectorPlugin>()
})
