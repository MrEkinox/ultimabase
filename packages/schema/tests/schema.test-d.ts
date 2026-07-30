import { expectTypeOf, test } from 'vitest'

import {
	booleanField,
	defineFieldExtension,
	defineSchema,
	defineSchemaExtension,
	stringField,
	type SchemaDefinition,
} from '../src/index.js'

test('preserves schema, field, and extension literals', () => {
	const permissions = defineSchemaExtension('fixture.permissions', {
		mode: 'strict',
	})
	const schema = defineSchema({
		className: 'Post',
		fields: {
			title: stringField({
				validation: {
					required: true,
				},
			}),
			published: booleanField({ default: false }),
		},
		extensions: [permissions],
	})

	expectTypeOf(schema.className).toEqualTypeOf<'Post'>()
	expectTypeOf<keyof typeof schema.fields>().toEqualTypeOf<
		'createdAt' | 'id' | 'published' | 'title' | 'updatedAt'
	>()
	expectTypeOf(schema.fields.title.kind).toEqualTypeOf<'string'>()
	expectTypeOf(schema.fields.published.kind).toEqualTypeOf<'boolean'>()
	expectTypeOf(schema.extensions).toEqualTypeOf<readonly [typeof permissions]>()
	expectTypeOf(schema.extensions[0].config.mode).toEqualTypeOf<'strict'>()
	expectTypeOf(schema).toExtend<
		SchemaDefinition<'Post', typeof schema.fields, typeof schema.extensions>
	>()

	// @ts-expect-error -- Schema metadata remains readonly after declaration.
	schema.className = 'Article'
	// @ts-expect-error -- The copied field map is immutable through the public API.
	schema.fields.title = stringField()
})

test('normalizes absent extensions to an empty tuple', () => {
	const schema = defineSchema({
		className: 'Post',
		fields: {},
	})

	expectTypeOf(schema.extensions).toEqualTypeOf<readonly []>()
})

test('rejects reserved fields and incompatible metadata', () => {
	// @ts-expect-error -- UltimaBase owns the id field.
	defineSchema({
		className: 'InvalidId',
		fields: {
			id: stringField(),
		},
	})
	// @ts-expect-error -- UltimaBase owns the createdAt field.
	defineSchema({
		className: 'InvalidCreatedAt',
		fields: {
			createdAt: stringField(),
		},
	})
	// @ts-expect-error -- UltimaBase owns the updatedAt field.
	defineSchema({
		className: 'InvalidUpdatedAt',
		fields: {
			updatedAt: stringField(),
		},
	})
	defineSchema({
		className: 'InvalidField',
		fields: {
			// @ts-expect-error -- Schema properties must use field definitions.
			title: 'string',
		},
	})
	defineSchema({
		className: 'InvalidExtension',
		fields: {},
		extensions: [
			// @ts-expect-error -- Field extensions cannot attach to a schema.
			defineFieldExtension('fixture.field', {}),
		],
	})
})
