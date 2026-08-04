import { expectTypeOf, test } from 'vitest'

import {
	booleanField,
	defineFieldExtension,
	Schema,
	defineSchemaExtension,
	stringField,
	type SchemaDefinition,
	type SchemaDraft,
} from '../index.js'

test('preserves schema, field, and extension literals', () => {
	const permissions = defineSchemaExtension('fixture.permissions', {
		mode: 'strict',
	})
	const schema = Schema.define({
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
	expectTypeOf(schema).toExtend<SchemaDefinition<'Post'>>()
	const draft = new schema({ title: 'Hello' })
	expectTypeOf(draft).toEqualTypeOf<SchemaDraft<typeof schema>>()
	expectTypeOf(draft.title).toBeString()
	expectTypeOf(draft.published).toEqualTypeOf<boolean | undefined>()
	expectTypeOf(draft.get('title')).toBeString()
	expectTypeOf(draft.toJSON().title).toBeString()

	// @ts-expect-error -- Schema metadata remains readonly after declaration.
	schema.className = 'Article'
	// @ts-expect-error -- The copied field map is immutable through the public API.
	schema.fields.title = stringField()
})

test('normalizes absent extensions to an empty tuple', () => {
	const schema = Schema.define({
		className: 'Post',
		fields: {},
	})

	expectTypeOf(schema.extensions).toEqualTypeOf<readonly []>()
})

test('preserves package-owned static capability inference', () => {
	const schema = Schema.defineWithStatics(
		{ className: 'SpecializedPost', fields: { title: stringField() } },
		(exactSchema) => ({
			byId: (id: string) => exactSchema.pointer(id),
		}),
	)

	expectTypeOf(schema.byId).parameter(0).toBeString()
	expectTypeOf(schema.byId('post-1').schema.className).toEqualTypeOf<
		'SpecializedPost'
	>()
	expectTypeOf(new schema({ title: 'Hello' })).toEqualTypeOf<
		SchemaDraft<typeof schema>
	>()
})

test('narrows untrusted values through Schema.define identity', () => {
	const value: unknown = Schema.define({ className: 'Post', fields: {} })

	if (Schema.is(value)) {
		expectTypeOf(value).toExtend<SchemaDefinition>()
	}
})

test('rejects reserved fields and incompatible metadata', () => {
	// @ts-expect-error -- Schema is a static declaration facade, not a function.
	Schema({ className: 'InvalidCall', fields: {} })
	// @ts-expect-error -- Schema is a static declaration facade, not a constructor.
	new Schema()
	// @ts-expect-error -- UltimaBase owns the id field.
	Schema.define({
		className: 'InvalidId',
		fields: {
			id: stringField(),
		},
	})
	// @ts-expect-error -- UltimaBase owns the createdAt field.
	Schema.define({
		className: 'InvalidCreatedAt',
		fields: {
			createdAt: stringField(),
		},
	})
	// @ts-expect-error -- UltimaBase owns the updatedAt field.
	Schema.define({
		className: 'InvalidUpdatedAt',
		fields: {
			updatedAt: stringField(),
		},
	})
	Schema.define({
		className: 'InvalidField',
		fields: {
			// @ts-expect-error -- Schema properties must use field definitions.
			title: 'string',
		},
	})
	Schema.define({
		className: 'InvalidExtension',
		fields: {},
		extensions: [
			// @ts-expect-error -- Field extensions cannot attach to a schema.
			defineFieldExtension('fixture.field', {}),
		],
	})
})
