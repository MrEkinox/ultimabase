import { expectTypeOf, test } from 'vitest'

import {
	definePluginField,
	definePluginFieldWireProtocol,
	type FieldDefinition,
	type FieldStructuralContainsOperand,
	type PluginFieldWireProtocol,
} from '../index.js'

const snapshotValue = (value: unknown, path: string): string => {
	if (typeof value !== 'string') {
		throw new TypeError(`${path} must be a string`)
	}

	return value
}

test('keeps plugin field options on the primary call contract', () => {
	const field = definePluginField(
		'fixture.diagnostic',
		{ list: true, default: ['first'] },
		{ snapshotValue },
	)

	expectTypeOf(field).toExtend<FieldDefinition<'fixture.diagnostic', string>>()

	definePluginField(
		'fixture.invalid-default',
		// @ts-expect-error -- List plugin defaults must provide a list value.
		{ list: true, default: 'first' },
		{ snapshotValue },
	)
})

test('carries the exact plugin containment operand at the type level', () => {
	const field = definePluginField(
		'fixture.containment-type',
		{},
		{
			snapshotValue,
			storageCodec: {
				decode: (value) => snapshotValue(value, 'stored value'),
				encode: String,
				format: 'json',
				version: 1,
			},
			structuralContains: {
				snapshotOperand: (
					value: unknown,
				): Readonly<{ readonly prefix: string }> => {
					if (
						typeof value !== 'object' ||
						value === null ||
						!('prefix' in value) ||
						typeof value.prefix !== 'string'
					) {
						throw new TypeError('operand must contain prefix')
					}

					return { prefix: value.prefix }
				},
			},
		},
	)

	expectTypeOf(field.kind).toEqualTypeOf<'fixture.containment-type'>()
	expectTypeOf<FieldStructuralContainsOperand<typeof field>>().toEqualTypeOf<
		Readonly<{ readonly prefix: string }>
	>()
})

test('retains exact canonical field wire protocol names and versions', () => {
	const protocol = definePluginFieldWireProtocol({
		name: 'fixture.transport',
		version: '1.2.3',
	})

	expectTypeOf(protocol).toEqualTypeOf<
		PluginFieldWireProtocol<'fixture.transport', '1.2.3'>
	>()
})
