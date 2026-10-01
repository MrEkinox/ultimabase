import { describe, expect, it } from 'vitest'

import {
	bigintField,
	binaryField,
	booleanField,
	dateField,
	dateTimeField,
	decimalField,
	enumField,
	floatField,
	intField,
	jsonField,
	objectField,
	pointerField,
	relationField,
	stringField,
	timeField,
	uuidField,
} from '../../index.js'
import { UltimaBase } from '../../../runtime/application/ultima-base.js'

type UntypedFieldFactory = (options: never) => unknown

const TargetSchema = UltimaBase.Schema.define({
	className: 'FieldOptionsTarget',
	fields: () => ({}),
})

const callWithJavaScriptOptions = (
	factory: UntypedFieldFactory,
	options: Readonly<Record<string, unknown>>,
): unknown => {
	// This test helper deliberately crosses the static factory boundary as JavaScript can.
	return factory(options as never)
}

const rootOptionCases = [
	{ factory: bigintField, kind: 'bigint', options: {} },
	{ factory: binaryField, kind: 'binary', options: {} },
	{ factory: booleanField, kind: 'boolean', options: {} },
	{ factory: dateField, kind: 'date', options: {} },
	{ factory: dateTimeField, kind: 'dateTime', options: {} },
	{ factory: decimalField, kind: 'decimal', options: {} },
	{ factory: enumField, kind: 'enum', options: { values: ['draft'] } },
	{ factory: floatField, kind: 'float', options: {} },
	{ factory: intField, kind: 'int', options: {} },
	{ factory: jsonField, kind: 'json', options: {} },
	{ factory: objectField, kind: 'object', options: { fields: {} } },
	{
		factory: pointerField,
		kind: 'pointer',
		options: { target: () => TargetSchema },
	},
	{
		factory: relationField,
		kind: 'relation',
		options: { target: () => TargetSchema },
	},
	{ factory: stringField, kind: 'string', options: {} },
	{ factory: timeField, kind: 'time', options: {} },
	{ factory: uuidField, kind: 'uuid', options: {} },
] as const satisfies readonly {
	readonly factory: UntypedFieldFactory
	readonly kind: string
	readonly options: Readonly<Record<string, unknown>>
}[]

describe('built-in field option contracts', () => {
	it.each(rootOptionCases)(
		'preserves an unresolved $kind root option for application compilation',
		({ factory, options }) => {
			const field = callWithJavaScriptOptions(factory, {
				...options,
				unknownRoot: true,
			})

			expect(field).toMatchObject({
				options: { unknownRoot: true },
			})
		},
	)

	it.each(['precision', 'scale'] as const)(
		'rejects decimal-only root option %s on another built-in field',
		(option) => {
			expect(() =>
				callWithJavaScriptOptions(stringField, { [option]: 2 }),
			).toThrow(new TypeError(`Unknown string field option: ${option}`))
		},
	)
})
