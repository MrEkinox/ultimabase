import { expectTypeOf, test } from 'vitest'

import {
	definePluginField,
	pointerField,
	Schema,
	stringField,
	type FieldBuilder,
	type SchemaDefinition,
} from '../../index.js'

const Target = Schema.define({ className: 'BuilderTypeTarget', fields: {} })

const Built = Schema.define({
	className: 'BuilderTypeSchema',
	fields(field) {
		expectTypeOf(field).toEqualTypeOf<FieldBuilder>()
		field.string('title', { validation: { required: true } })
		field.boolean('published', { default: false })
		field.int('views', { autoIncrement: true })
		field.bigint('sequence')
		field.float('score')
		field.decimal('price')
		field.uuid('externalId')
		field.date('day', { autoNow: true })
		field.dateTime('createdOn')
		field.time('opensAt')
		field.binary('content')
		field.json('metadata')
		field.enum('status', {
			default: 'draft',
			values: ['draft', 'published'] as const,
		})
		field.pointer('owner', { target: () => Target })
		field.relation('targets', { target: () => Target })
		field.relation('invalidMappedTarget', {
			target: () => Target,
			// @ts-expect-error -- mappedBy stays restricted to the exact lazy target.
			mappedBy: 'missing',
		})
		field.object('profile', {
			fields(field) {
				field.string('displayName')
				field.int('age')
				field.object('preferences', {
					fields(field) {
						field.boolean('darkMode')
					},
				})

				expectTypeOf(field).not.toHaveProperty('pointer')
				expectTypeOf(field).not.toHaveProperty('relation')
				// @ts-expect-error -- Embedded integers cannot own database sequences.
				field.int('sequence', { autoIncrement: true })
				// @ts-expect-error -- Low-level composition retains embedded restrictions.
				field.add('owner', pointerField({ target: () => Target }))
			},
		})
		field.add('slug', stringField())
		field.add(
			'pluginValue',
			definePluginField(
				'fixture.builder',
				{},
				{ snapshotValue: (value) => String(value) },
			),
		)

		// @ts-expect-error -- Builder methods keep the existing option contracts.
		field.boolean('invalid', { default: 'false' })
		// @ts-expect-error -- Pointer setNull remains incompatible with required input.
		field.pointer('invalidPointer', {
			onDelete: 'setNull',
			target: () => Target,
			validation: { required: true },
		})
		expectTypeOf(field).not.toHaveProperty('vector')
	},
})

test('types the canonical builder surface before generated model contracts', () => {
	expectTypeOf(Built).toExtend<SchemaDefinition>()
	expectTypeOf(Built.className).toEqualTypeOf<'BuilderTypeSchema'>()
})

test('accepts the same builder declaration in package-owned specializations', () => {
	const WithStatics = Schema.defineWithStatics(
		{
			className: 'BuilderTypeStatics',
			fields(field) {
				field.string('title')
			},
		},
		() => ({ source: 'static' as const }),
	)
	const WithCapabilities = Schema.defineWithCapabilities(
		{
			className: 'BuilderTypeCapabilities',
			fields(field) {
				field.string('title')
			},
		},
		() => ({ results: {}, statics: { source: 'capability' as const } }),
	)

	expectTypeOf(WithStatics.source).toEqualTypeOf<'static'>()
	expectTypeOf(WithCapabilities.source).toEqualTypeOf<'capability'>()
})
