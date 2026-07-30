import { expectTypeOf, test } from 'vitest'

import {
	defineFieldExtension,
	defineSchemaExtension,
	numberField,
	type FieldDefinition,
	type NumberField,
	type NumberFieldOptions,
	type NumberValidationOptions,
} from '../src/index.js'

test('preserves integer mode and every option literal', () => {
	const field = numberField({
		mode: 'integer',
		validation: {
			required: true,
			nullable: false,
			range: {
				min: -10,
				max: 10,
			},
			finite: true,
		},
		default: 0,
		immutable: true,
		indexed: 'unique',
		description: 'Signed score',
	})

	// Exact mode and constraints remain available to later schema inference.
	expectTypeOf(field).toExtend<FieldDefinition<'number', number>>()
	expectTypeOf(field.kind).toEqualTypeOf<'number'>()
	expectTypeOf(field.options.mode).toEqualTypeOf<'integer'>()
	expectTypeOf(field.options.validation.required).toEqualTypeOf<true>()
	expectTypeOf(field.options.validation.nullable).toEqualTypeOf<false>()
	expectTypeOf(field.options.validation.range.min).toEqualTypeOf<-10>()
	expectTypeOf(field.options.validation.range.max).toEqualTypeOf<10>()
	expectTypeOf(field.options.validation.finite).toEqualTypeOf<true>()
	expectTypeOf(field.options.default).toEqualTypeOf<0>()
})

test('keeps float mode within the JavaScript number contract', () => {
	const field = numberField({
		mode: 'float',
		validation: {
			range: {
				min: -1.5,
				max: 4.25,
			},
			finite: false,
		},
	})

	expectTypeOf(field).toExtend<NumberField>()
	expectTypeOf(field.options.mode).toEqualTypeOf<'float'>()
	expectTypeOf(field.options.validation.range.min).toEqualTypeOf<-1.5>()
	expectTypeOf(field.options.validation.finite).toEqualTypeOf<false>()
})

test('preserves field extension literals', () => {
	const extension = defineFieldExtension('fixture.unit', {
		name: 'meters',
	})
	const field = numberField({
		mode: 'float',
		extensions: [extension],
	})

	expectTypeOf(field.options.extensions).toEqualTypeOf<
		readonly [
			{
				readonly scope: 'field'
				readonly name: 'fixture.unit'
				readonly config: Readonly<{ readonly name: 'meters' }>
			},
		]
	>()
})

test('rejects missing, decimal, and incompatible numeric metadata', () => {
	// @ts-expect-error -- Numeric fields require an explicit mode.
	numberField()
	// @ts-expect-error -- Decimal precision will use a separate future field contract.
	numberField({ mode: 'decimal' })
	// @ts-expect-error -- Numeric defaults must use the field's base value type.
	numberField({ mode: 'integer', default: '0' })
	// @ts-expect-error -- The finite constraint is a boolean literal.
	numberField({ mode: 'float', validation: { finite: 'yes' } })
	// @ts-expect-error -- Range boundaries must be JavaScript numbers.
	numberField({ mode: 'float', validation: { range: { min: '0' } } })
	numberField({
		mode: 'integer',
		validation: {
			required: true,
			// @ts-expect-error -- Required fields cannot also be nullable.
			nullable: true,
		},
	})
	numberField({
		mode: 'float',
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.unit', {})],
	})

	expectTypeOf<NumberFieldOptions>().toExtend<
		FieldDefinition<'number', number>['options']
	>()
	expectTypeOf<NumberValidationOptions>().toExtend<
		NonNullable<NumberFieldOptions['validation']>
	>()
})
