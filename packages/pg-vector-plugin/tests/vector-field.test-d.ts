import { expect, expectTypeOf, test } from 'vitest'

import {
	vectorField,
	vectorFieldKind,
	type VectorField,
	type VectorFieldOptions,
} from '../src/index.js'
import {
	snapshotScalarFieldValue,
	type FieldDefinition,
	type FieldValue,
} from '@ultimabase/core'

test('infers vector kinds, dimensions, and values', () => {
	const field = vectorField({
		dimensions: 3,
		required: true,
		default: [1, 2, 3],
	})

	expect(field.kind).toBe(vectorFieldKind)
	expectTypeOf(field).toExtend<
		FieldDefinition<
			typeof vectorFieldKind,
			readonly number[],
			VectorFieldOptions
		>
	>()
	expectTypeOf(field).toExtend<VectorField>()
	expectTypeOf(field.kind).toEqualTypeOf<'pg-vector.vector'>()
	expectTypeOf(field.options.dimensions).toEqualTypeOf<3>()
	expectTypeOf(field.options.default).toEqualTypeOf<readonly [1, 2, 3]>()
	expectTypeOf<FieldValue<typeof field>>().toEqualTypeOf<readonly number[]>()
})

test('infers vector lists without confusing vector components with list wrappers', () => {
	const field = vectorField({
		dimensions: 2,
		list: true,
		default: [
			[1, 2],
			[3, 4],
		],
	})

	expect(field.options.list).toBe(true)
	expectTypeOf<FieldValue<typeof field>>().toEqualTypeOf<
		readonly (readonly number[])[]
	>()
})

test('retains vector values through the public snapshot boundary', () => {
	const field = vectorField({ dimensions: 2 })
	const value = snapshotScalarFieldValue(field, unknownValue, 'embedding')

	expectTypeOf(value).toEqualTypeOf<readonly number[]>()
})

declare const unknownValue: unknown

test('rejects incompatible vector options', () => {
	// @ts-expect-error -- Dimensions are numeric logical metadata.
	vectorField({ dimensions: 'three' })

	// @ts-expect-error -- Scalar vector defaults must contain numbers.
	vectorField({ dimensions: 2, default: ['1', '2'] })
})
