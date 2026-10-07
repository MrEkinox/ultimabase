import type { StandardSchemaV1 } from '@standard-schema/spec'
import * as v from 'valibot'
import { expectTypeOf, test } from 'vitest'
import { z } from 'zod'

import {
	definePluginField,
	type FieldOptions,
	type JsonDocument,
	type Pointer,
	type SchemaReference,
	UltimaBase,
} from '@ultimabase/core'

import { validationPlugin } from './plugin.js'

const ValidationApplication = UltimaBase.use(validationPlugin())

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

const PointerTarget = ValidationApplication.Schema.define({
	className: 'ValidationPointerTarget',
	fields: () => ({}),
})
void PointerTarget
declare const enumSchema: StandardSchemaV1<'draft' | 'published'>
declare const objectSchema: StandardSchemaV1<
	{ name: string; tags: string[] },
	Readonly<{ readonly name: string; readonly tags: readonly string[] }>
>
declare const pointerSchema: StandardSchemaV1<
	Pointer<SchemaReference<'ValidationPointerTarget'>>
>

class PluginScalar {
	constructor(readonly value: string) {}
}

declare const pluginSchema: StandardSchemaV1<PluginScalar> & {
	readonly nullable: () => unknown
}
type PluginScalarOptions = FieldOptions<PluginScalar> & {
	readonly validation: typeof pluginSchema
}

test('built-in scalar families accept exact Standard Schema values', () => {
	const Builtins = ValidationApplication.Schema.define({
		className: 'ValidationStandardSchemaBuiltins',
		fields: (field) => ({
			bigint: field.bigint({ validation: bigintSchema }),
			binary: field.binary({ validation: bytesSchema }),
			boolean: field.boolean({ validation: booleanSchema }),
			branded: field.string({ validation: brandedStringSchema }),
			callable: field.string({ validation: callableStringSchema }),
			date: field.date({ validation: stringSchema }),
			dateTime: field.dateTime({ validation: stringSchema }),
			decimal: field.decimal({ validation: stringSchema }),
			enum: field.enum({
				validation: enumSchema,
				values: ['draft', 'published'],
			}),
			float: field.float({ validation: numberSchema }),
			int: field.int({ validation: numberSchema }),
			json: field.json({ validation: jsonSchema }),
			list: field.string({ list: true, validation: stringListSchema }),
			object: field.object({
				fields: (nested) => ({
					name: nested.string({ required: true }),
					tags: nested.string({ list: true, required: true }),
				}),
				validation: objectSchema,
			}),
			pointer: field.pointer({
				target: 'ValidationPointerTarget',
				validation: pointerSchema,
			}),
			string: field.string({ validation: stringSchema }),
			time: field.time({ validation: stringSchema }),
			unknownInput: field.string({ validation: unknownToStringSchema }),
			uuid: field.uuid({ validation: stringSchema }),
		}),
	})

	expectTypeOf(Builtins).toExtend<object>()
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
	ValidationApplication.Schema.define({
		className: 'InvalidSourceValidationContracts',
		fields: (field) => ({
			// @ts-expect-error A validator input cannot be narrower than the canonical value.
			literal: field.string({ validation: literalInputSchema }),
			// @ts-expect-error A scalar validator cannot validate a complete list field.
			list: field.string({ list: true, validation: stringSchema }),
			// @ts-expect-error A validator output must remain assignable to the field value.
			output: field.string({ validation: stringToNumberSchema }),
			// @ts-expect-error An inferred unsafe input cannot bypass compatibility checks.
			unsafeInput: field.string({ validation: unsafeInputSchema }),
			// @ts-expect-error An inferred unsafe output cannot leak through the field API.
			unsafeOutput: field.string({ validation: unsafeOutputSchema }),
		}),
	})
})

test('real Standard Schema libraries retain their inferred protocol types', () => {
	const zodObject = z.object({ label: z.string().min(1) })
	const valibotObject = v.object({
		label: v.pipe(v.string(), v.minLength(1)),
	})

	expectTypeOf<StandardSchemaV1.InferInput<typeof zodObject>>().toEqualTypeOf<{
		label: string
	}>()
	expectTypeOf<StandardSchemaV1.InferOutput<typeof zodObject>>().toEqualTypeOf<{
		label: string
	}>()
	expectTypeOf<
		StandardSchemaV1.InferInput<typeof valibotObject>
	>().toEqualTypeOf<{ label: string }>()
	expectTypeOf<
		StandardSchemaV1.InferOutput<typeof valibotObject>
	>().toEqualTypeOf<{ label: string }>()
	ValidationApplication.Schema.define({
		className: 'ValidationStandardSchemaLibraries',
		fields: (field) => ({
			valibot: field.object({
				fields: (nested) => ({ label: nested.string({ required: true }) }),
				validation: valibotObject,
			}),
			zod: field.object({
				fields: (nested) => ({ label: nested.string({ required: true }) }),
				validation: zodObject,
			}),
		}),
	})
})
