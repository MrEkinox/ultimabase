import { expectTypeOf, test } from 'vitest'

import {
	decimalField,
	defineFieldExtension,
	Schema,
	defineSchemaExtension,
	type DecimalField,
	type DecimalFieldOptions,
	type DecimalValidationOptions,
	type FieldDefinition,
	type FieldInferenceState,
	type FieldInferenceStateOf,
	type FieldValue,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
} from '../../index.js'

test('retains only decimal metadata that affects inference', () => {
	const field = decimalField({
		validation: {
			required: true,
			precision: 12,
			scale: 2,
			range: {
				min: '-9999999999.99',
				max: '9999999999.99',
			},
		},
		default: '19.99',
	})

	expectTypeOf(field).toExtend<
		FieldDefinition<'decimal', string, DecimalFieldOptions, FieldInferenceState>
	>()
	expectTypeOf(field).toExtend<DecimalField>()
	expectTypeOf(field.kind).toEqualTypeOf<'decimal'>()
	expectTypeOf(field.options).toEqualTypeOf<Readonly<DecimalFieldOptions>>()
	expectTypeOf<FieldInferenceStateOf<typeof field>>().toEqualTypeOf<{
		readonly create: 'optional'
		readonly object: 'required'
		readonly update: 'optional'
		readonly nullable: false
		readonly list: false
	}>()
	expectTypeOf<FieldValue<typeof field>>().toEqualTypeOf<string>()
})

test('infers homogeneous exact decimal lists', () => {
	const field = decimalField({
		list: true,
		default: ['1.25', '2.50'],
	})

	expectTypeOf(field).toExtend<DecimalField>()
	expectTypeOf<
		FieldInferenceStateOf<typeof field>['list']
	>().toEqualTypeOf<true>()
	expectTypeOf<FieldValue<typeof field>>().toEqualTypeOf<readonly string[]>()
})

test('uses a compact optional scalar state by default', () => {
	const field = decimalField()

	expectTypeOf(field.options).toEqualTypeOf<Readonly<DecimalFieldOptions>>()
	expectTypeOf<FieldInferenceStateOf<typeof field>>().toEqualTypeOf<{
		readonly create: 'optional'
		readonly object: 'required'
		readonly update: 'optional'
		readonly nullable: true
		readonly list: false
	}>()
})

test('derives decimal create, object, and update shapes from compact state', () => {
	const extension = defineFieldExtension('fixture.decimal', {})
	const schema = Schema.define({
		className: 'DecimalState',
		fields: (field) => ({
			required: field.decimal({ validation: { required: true } }),
			defaulted: field.decimal({ default: '0.00' }),
			nullable: field.decimal(),
			immutable: field.decimal({ immutable: true }),
			matrix: field.decimal({ list: true }),
			extended: field.decimal({ extensions: [extension] }),
		}),
	})

	expectTypeOf(schema.className).toEqualTypeOf<'DecimalState'>()
	expectTypeOf<InferCreateInput<typeof schema>>().toEqualTypeOf<{
		required: string
		defaulted?: string | null
		nullable?: string | null
		immutable?: string | null
		matrix?: readonly string[] | null
		extended?: string | null
	}>()
	expectTypeOf<InferObject<typeof schema>>().toEqualTypeOf<{
		readonly id: string
		readonly createdAt: string
		readonly updatedAt: string
		readonly required: string
		readonly defaulted: string | null
		readonly nullable: string | null
		readonly immutable: string | null
		readonly matrix: readonly string[] | null
		readonly extended: string | null
	}>()
	expectTypeOf<InferUpdateInput<typeof schema>>().toEqualTypeOf<{
		required?: string
		defaulted?: string | null
		nullable?: string | null
		matrix?: readonly string[] | null
		extended?: string | null
	}>()
	// Runtime extensions retain their public option contract without changing shapes.
	expectTypeOf(schema.fields.extended.options.extensions).toEqualTypeOf<
		DecimalFieldOptions['extensions']
	>()
})

test('rejects incompatible decimal metadata', () => {
	// @ts-expect-error -- Numbers cannot preserve arbitrary decimal precision.
	decimalField({ default: 19.99 })

	// @ts-expect-error -- Decimal range boundaries use exact strings.
	decimalField({ validation: { range: { min: 0 } } })

	// @ts-expect-error -- Runtime factories must produce exact decimal strings.
	decimalField({ default: () => 19.99 })

	// @ts-expect-error -- Nullability is derived and cannot be configured.
	decimalField({ validation: { required: true, nullable: true } })

	decimalField({
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.decimal', {})],
	})

	expectTypeOf<DecimalValidationOptions>().toExtend<
		NonNullable<DecimalFieldOptions['validation']>
	>()
})
