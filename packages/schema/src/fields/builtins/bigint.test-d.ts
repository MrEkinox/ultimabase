import { expectTypeOf, test } from 'vitest'

import {
	bigintField,
	defineSchema,
	defineSchemaExtension,
	type BigintField,
	type BigintFieldOptions,
	type BigintValidationOptions,
	type FieldDefinition,
	type FieldInferenceState,
	type FieldInferenceStateOf,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
} from '../../index.js'

const bigintSchema = defineSchema({
	className: 'BigintRecord',
	fields: {
		sequence: bigintField({
			validation: {
				required: true,
				range: {
					min: 0n,
				},
			},
			autoIncrement: true,
		}),
		balance: bigintField({ default: 0n }),
		relatedIds: bigintField({ list: true }),
	},
})

test('preserves bigint literals and operation-specific inference', () => {
	type ObjectShape = InferObject<typeof bigintSchema>
	type CreateShape = InferCreateInput<typeof bigintSchema>
	type UpdateShape = InferUpdateInput<typeof bigintSchema>

	expectTypeOf(bigintSchema.fields.sequence).toExtend<
		FieldDefinition<'bigint', bigint, BigintFieldOptions, FieldInferenceState>
	>()
	expectTypeOf(bigintSchema.fields.sequence).toExtend<BigintField>()
	expectTypeOf<
		FieldInferenceStateOf<typeof bigintSchema.fields.sequence>['object']
	>().toEqualTypeOf<'required'>()
	expectTypeOf<ObjectShape['sequence']>().toEqualTypeOf<bigint>()
	expectTypeOf<ObjectShape['balance']>().toEqualTypeOf<bigint>()
	expectTypeOf<ObjectShape['relatedIds']>().toEqualTypeOf<
		readonly bigint[] | undefined
	>()
	expectTypeOf<CreateShape['sequence']>().toEqualTypeOf<bigint | undefined>()
	expectTypeOf<CreateShape['balance']>().toEqualTypeOf<bigint | undefined>()
	expectTypeOf<UpdateShape['sequence']>().toEqualTypeOf<bigint | undefined>()
})

test('rejects incompatible bigint metadata', () => {
	// @ts-expect-error -- Bigint fields do not expose float-only finite metadata.
	bigintField({ validation: { finite: true } })

	// @ts-expect-error -- Bigint defaults must use native bigint values.
	bigintField({ default: 0 })

	// @ts-expect-error -- Bigint ranges cannot mix JavaScript numbers.
	bigintField({ validation: { range: { min: 0 } } })

	// @ts-expect-error -- Required fields cannot also be nullable.
	bigintField({
		validation: {
			required: true,
			nullable: true,
		},
	})

	bigintField({
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.unit', {})],
	})

	expectTypeOf<BigintFieldOptions>().toExtend<
		FieldDefinition<'bigint', bigint>['options']
	>()
	expectTypeOf<BigintValidationOptions>().toExtend<
		NonNullable<BigintFieldOptions['validation']>
	>()
})
