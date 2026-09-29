import { expectTypeOf, test } from 'vitest'

import {
	UltimaBase,
	type FieldBuilder,
	type SchemaItem,
} from '@ultimabase/core'

import {
	pgVectorPlugin,
	type PgVectorPlugin,
	type VectorValue,
} from '../src/index.js'

const VectorApplication = UltimaBase.use(pgVectorPlugin())
const VectorDocument = VectorApplication.Schema.define({
	className: 'PgVectorSourceDocument',
	fields: (field) => ({
		embedding: field.vector({ dimensions: 3, required: true }),
		embeddings: field.vector({ dimensions: 3, list: true }),
	}),
})

test('types the source vector method with the existing exact options', () => {
	expectTypeOf(
		VectorDocument.className,
	).toEqualTypeOf<'PgVectorSourceDocument'>()
	expectTypeOf<VectorValue>().toEqualTypeOf<readonly number[]>()
	expectTypeOf<SchemaItem<typeof VectorDocument>['embedding']>().toEqualTypeOf<
		readonly number[]
	>()
	expectTypeOf<SchemaItem<typeof VectorDocument>['embeddings']>().toEqualTypeOf<
		readonly (readonly number[])[] | null
	>()

	VectorApplication.Schema.define({
		className: 'InvalidVectorDimensions',
		fields: (field) => ({
			embedding: field.vector({
				// @ts-expect-error -- Dimensions remain numeric metadata.
				dimensions: 'three',
			}),
		}),
	})
	VectorApplication.Schema.define({
		className: 'InvalidVectorDefault',
		fields: (field) => ({
			embedding: field.vector({
				dimensions: 2,
				// @ts-expect-error -- Defaults retain the vector's numeric value type.
				default: ['one', 'two'],
			}),
		}),
	})
})

test('keeps plugin methods generated rather than globally augmenting Core', () => {
	expectTypeOf<FieldBuilder>().not.toHaveProperty('vector')
	expectTypeOf(pgVectorPlugin()).toEqualTypeOf<PgVectorPlugin>()
})
