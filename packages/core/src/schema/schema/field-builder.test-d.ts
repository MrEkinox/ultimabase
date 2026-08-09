import { expectTypeOf, test } from 'vitest'

import {
	definePluginField,
	Schema,
	stringField,
	type EmbeddedFieldBuilder,
	type FieldBuilder,
	type SchemaDefinition,
} from '../../index.js'

const Target = Schema.define({
	className: 'BuilderTypeTarget',
	fields: () => ({}),
})
const pluginValue = definePluginField(
	'fixture.builder',
	{},
	{ snapshotValue: (value) => String(value) },
)
const slug = stringField()

const Built = Schema.define({
	className: 'BuilderTypeSchema',
	fields: (field) => {
		expectTypeOf(field).toEqualTypeOf<FieldBuilder>()
		return {
			content: field.binary(),
			createdOn: field.dateTime(),
			day: field.date({ autoNow: true }),
			externalId: field.uuid(),
			invalidMappedTarget: field.relation({
				target: () => Target,
				// @ts-expect-error -- mappedBy stays restricted to the exact lazy target.
				mappedBy: 'missing',
			}),
			metadata: field.json(),
			opensAt: field.time(),
			owner: field.pointer({ target: () => Target }),
			pluginValue,
			price: field.decimal(),
			profile: field.object({
				fields: (field) => {
					expectTypeOf(field).toEqualTypeOf<EmbeddedFieldBuilder>()
					expectTypeOf(field).not.toHaveProperty('pointer')
					expectTypeOf(field).not.toHaveProperty('relation')
					return {
						age: field.int(),
						displayName: field.string(),
						preferences: field.object({
							fields: (field) => ({ darkMode: field.boolean() }),
						}),
						// @ts-expect-error -- Embedded integers cannot own database sequences.
						sequence: field.int({ autoIncrement: true }),
					}
				},
			}),
			published: field.boolean({ default: false }),
			score: field.float(),
			sequence: field.bigint(),
			slug,
			status: field.enum({
				default: 'draft',
				values: ['draft', 'published'] as const,
			}),
			targets: field.relation({ target: () => Target }),
			title: field.string({ validation: { required: true } }),
			views: field.int({ autoIncrement: true }),
			// @ts-expect-error -- Builder methods retain each field option contract.
			invalidBoolean: field.boolean({ default: 'false' }),
			// @ts-expect-error -- setNull remains incompatible with required input.
			invalidPointer: field.pointer({
				onDelete: 'setNull',
				target: () => Target,
				validation: { required: true },
			}),
		}
	},
})

test('types the canonical map-returning builder surface', () => {
	expectTypeOf(Built).toExtend<SchemaDefinition>()
	expectTypeOf(Built.className).toEqualTypeOf<'BuilderTypeSchema'>()
	expectTypeOf(Built.fields.title.kind).toEqualTypeOf<'string'>()
	expectTypeOf(Built.fields.owner.kind).toEqualTypeOf<'pointer'>()
	expectTypeOf<FieldBuilder>().not.toHaveProperty('add')
	expectTypeOf<FieldBuilder>().not.toHaveProperty('vector')
})

test('accepts the same declaration in package-owned specializations', () => {
	const WithStatics = Schema.defineWithStatics(
		{
			className: 'BuilderTypeStatics',
			fields: (field) => ({ title: field.string() }),
		},
		() => ({ source: 'static' as const }),
	)
	const WithCapabilities = Schema.defineWithCapabilities(
		{
			className: 'BuilderTypeCapabilities',
			fields: (field) => ({ title: field.string() }),
		},
		() => ({ results: {}, statics: { source: 'capability' as const } }),
	)

	expectTypeOf(WithStatics.source).toEqualTypeOf<'static'>()
	expectTypeOf(WithCapabilities.source).toEqualTypeOf<'capability'>()
})
