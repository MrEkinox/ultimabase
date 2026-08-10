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
	Schema,
	stringField,
	timeField,
	uuidField,
} from '../../index.js'

type UntypedFieldFactory = (options: never) => unknown

const TargetSchema = Schema.define({
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

const validationOptionCases = rootOptionCases.filter(
	(testCase) => testCase.kind !== 'relation',
)

describe('built-in field option contracts', () => {
	it.each(rootOptionCases)(
		'rejects an unknown $kind root option with its exact path',
		({ factory, kind, options }) => {
			expect(() =>
				callWithJavaScriptOptions(factory, {
					...options,
					unknownRoot: true,
				}),
			).toThrow(new TypeError(`Unknown ${kind} field option: unknownRoot`))
		},
	)

	it.each(validationOptionCases)(
		'rejects an unknown $kind validation option with its exact path',
		({ factory, kind, options }) => {
			expect(() =>
				callWithJavaScriptOptions(factory, {
					...options,
					validation: { requred: true },
				}),
			).toThrow(
				new TypeError(`Unknown ${kind} field option: validation.requred`),
			)
		},
	)

	it.each([
		{
			factory: stringField,
			kind: 'string',
			options: { validation: { length: { minimum: 1 } } },
			path: 'validation.length.minimum',
		},
		{
			factory: intField,
			kind: 'int',
			options: { validation: { range: { maximum: 10 } } },
			path: 'validation.range.maximum',
		},
	] as const)(
		'rejects an unknown $kind nested constraint option with its exact path',
		({ factory, kind, options, path }) => {
			expect(() => callWithJavaScriptOptions(factory, options)).toThrow(
				new TypeError(`Unknown ${kind} field option: ${path}`),
			)
		},
	)
})
