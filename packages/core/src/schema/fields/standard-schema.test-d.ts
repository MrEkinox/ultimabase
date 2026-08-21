import type { StandardSchemaV1 } from '@standard-schema/spec'
import { expectTypeOf, test } from 'vitest'

import {
	bigintField,
	binaryField,
	booleanField,
	dateField,
	dateTimeField,
	definePluginField,
	decimalField,
	enumField,
	floatField,
	type FieldOptions,
	intField,
	type JsonDocument,
	jsonField,
	objectField,
	type Pointer,
	pointerField,
	Schema,
	stringField,
	timeField,
	uuidField,
} from '../index.js'

declare const stringSchema: StandardSchemaV1<string>
declare const callableStringSchema: StandardSchemaV1<string> & (() => void)
declare const unknownToStringSchema: StandardSchemaV1<unknown, string>
declare const brandedStringSchema: StandardSchemaV1<
	string,
	string & { readonly __brand: 'validated' }
>
declare const stringListSchema: StandardSchemaV1<string[]>
declare const literalInputSchema: StandardSchemaV1<'only-this', string>
declare const stringToNumberSchema: StandardSchemaV1<string, number>
declare const bigintSchema: StandardSchemaV1<bigint>
declare const bytesSchema: StandardSchemaV1<Uint8Array>
declare const booleanSchema: StandardSchemaV1<boolean>
declare const numberSchema: StandardSchemaV1<number>
declare const jsonSchema: StandardSchemaV1<JsonDocument>

type ParsedJson = ReturnType<typeof JSON.parse>
declare const unsafeInputSchema: StandardSchemaV1<ParsedJson, string>
declare const unsafeOutputSchema: StandardSchemaV1<string, ParsedJson>

const PointerTarget = Schema.define({
	className: 'ValidationPointerTarget',
	fields: () => ({}),
})
declare const enumSchema: StandardSchemaV1<'draft' | 'published'>
declare const objectSchema: StandardSchemaV1<
	{ name: string; tags: string[] },
	Readonly<{ readonly name: string; readonly tags: readonly string[] }>
>
declare const pointerSchema: StandardSchemaV1<Pointer<typeof PointerTarget>>

class PluginScalar {
	constructor(readonly value: string) {}
}

declare const pluginSchema: StandardSchemaV1<PluginScalar> & {
	readonly nullable: () => unknown
}
type PluginScalarOptions = FieldOptions<PluginScalar, typeof pluginSchema>

test('built-in scalar families accept exact Standard Schema values', () => {
	expectTypeOf(
		stringField({ validation: stringSchema }).kind,
	).toEqualTypeOf<'string'>()
	stringField({ validation: callableStringSchema })
	stringField({ validation: unknownToStringSchema })
	stringField({ validation: brandedStringSchema })
	stringField({ list: true, validation: stringListSchema })
	bigintField({ validation: bigintSchema })
	binaryField({ validation: bytesSchema })
	booleanField({ validation: booleanSchema })
	intField({ validation: numberSchema })
	floatField({ validation: numberSchema })
	decimalField({ validation: stringSchema })
	dateField({ validation: stringSchema })
	dateTimeField({ validation: stringSchema })
	timeField({ validation: stringSchema })
	uuidField({ validation: stringSchema })
	jsonField({ validation: jsonSchema })
	enumField({ values: ['draft', 'published'], validation: enumSchema })
	objectField({
		fields: {
			name: stringField({ required: true }),
			tags: stringField({ list: true, required: true }),
		},
		validation: objectSchema,
	})
	pointerField({ target: () => PointerTarget, validation: pointerSchema })
	definePluginField<
		PluginScalar,
		'fixture.standard-schema',
		PluginScalarOptions
	>(
		'fixture.standard-schema',
		{ validation: pluginSchema },
		{
			snapshotValue: (value): PluginScalar => {
				if (!(value instanceof PluginScalar)) {
					throw new TypeError('Expected PluginScalar')
				}

				return value
			},
		},
	)
})

test('field validators reject incompatible and unsafe inferred types', () => {
	// @ts-expect-error A validator input cannot be narrower than the canonical value.
	stringField({ validation: literalInputSchema })
	// @ts-expect-error A validator output must remain assignable to the field value.
	stringField({ validation: stringToNumberSchema })
	// @ts-expect-error A scalar validator cannot validate a complete list field.
	stringField({ list: true, validation: stringSchema })
	// @ts-expect-error An inferred unsafe input cannot bypass compatibility checks.
	stringField({ validation: unsafeInputSchema })
	// @ts-expect-error An inferred unsafe output cannot leak through the field API.
	stringField({ validation: unsafeOutputSchema })
})
