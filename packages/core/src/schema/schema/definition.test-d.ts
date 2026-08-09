import { expectTypeOf, test } from 'vitest'

import {
	defineContextualSchemaExtensionFactory,
	defineFieldExtension,
	Schema,
	defineSchemaExtension,
	stringField,
	type SchemaDefinition,
	type SchemaDraft,
	type SchemaExtension,
	type SchemaExtensionContextKind,
} from '../index.js'

interface ContextualFixtureOptions<
	TData extends Readonly<Record<string, unknown>>,
> {
	readonly select: (data: TData) => string
}

type ContextualFixtureExtension<
	TData extends Readonly<Record<string, unknown>>,
> = SchemaExtension<'fixture.contextual', ContextualFixtureOptions<TData>>

type ContextualFixtureData<TData> =
	TData extends Readonly<Record<string, unknown>> ? TData : never

interface ContextualFixtureKind extends SchemaExtensionContextKind {
	readonly options: ContextualFixtureOptions<
		ContextualFixtureData<this['data']>
	>
	readonly extension: ContextualFixtureExtension<
		ContextualFixtureData<this['data']>
	>
}

const createContextualFixture = <
	TData extends Readonly<Record<string, unknown>>,
>(
	options: ContextualFixtureOptions<TData>,
): ContextualFixtureExtension<TData> =>
	defineSchemaExtension('fixture.contextual', options)

const contextualFixture =
	defineContextualSchemaExtensionFactory<ContextualFixtureKind>()(
		createContextualFixture,
	)

test('preserves schema, field, and extension literals', () => {
	const permissions = defineSchemaExtension('fixture.permissions', {
		mode: 'strict',
	})
	const schema = Schema.define({
		className: 'Post',
		fields: (field) => ({
			title: field.string({
				validation: {
					required: true,
				},
			}),
			published: field.boolean({ default: false }),
		}),
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
	expectTypeOf(draft.published).toEqualTypeOf<boolean | null | undefined>()
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
		fields: () => ({}),
	})

	expectTypeOf(schema.extensions).toEqualTypeOf<readonly []>()
})

test('includes extension-owned fields in schema and draft inference', () => {
	const extensionField = stringField({ validation: { required: true } })
	const storage = defineSchemaExtension(
		'fixture.storage',
		{},
		'fixture.plugin',
		{ fields: { privateValue: extensionField } },
	)
	const schema = Schema.define({
		className: 'ExtendedPost',
		fields: (field) => ({ title: field.string() }),
		extensions: [storage],
	})

	expectTypeOf(schema.fields.privateValue).toEqualTypeOf(extensionField)
	expectTypeOf(new schema({ privateValue: 'secret' }).privateValue).toBeString()
})

test('binds community extension callbacks to exact sibling fields', () => {
	const schema = Schema.define({
		className: 'ContextualPost',
		fields: (field) => ({
			published: field.boolean({ default: false }),
			title: field.string({ validation: { required: true } }),
			visibility: field.string(),
		}),
		extensions: ({ bind }) => [
			bind(contextualFixture, {
				select: (data) => {
					expectTypeOf(data.title).toEqualTypeOf<string>()
					expectTypeOf(data.published).toEqualTypeOf<boolean | null>()
					expectTypeOf(data.visibility).toEqualTypeOf<string | null>()
					const selectField = <TKey extends keyof typeof data>(
						field: TKey,
					): TKey => field
					// @ts-expect-error -- Contextual data contains no framework fields.
					selectField('id')
					// @ts-expect-error -- Undeclared names do not survive contextual binding.
					selectField('unknown')

					return data.title
				},
			}),
		],
	})

	const [extension] = schema.extensions

	expectTypeOf(extension.name).toEqualTypeOf<'fixture.contextual'>()
	expectTypeOf(extension.config.select).parameter(0).toEqualTypeOf<
		Readonly<{
			published: boolean | null
			title: string
			visibility: string | null
		}>
	>()
})

test('preserves package-owned static capability inference', () => {
	const schema = Schema.defineWithStatics(
		{
			className: 'SpecializedPost',
			fields: (field) => ({ title: field.string() }),
		},
		(exactSchema) => ({
			byId: (id: string) => exactSchema.pointer(id),
		}),
	)

	expectTypeOf(schema.byId).parameter(0).toBeString()
	expectTypeOf(
		schema.byId('post-1').schema.className,
	).toEqualTypeOf<'SpecializedPost'>()
	expectTypeOf(new schema({ title: 'Hello' })).toEqualTypeOf<
		SchemaDraft<typeof schema>
	>()
})

test('narrows untrusted values through Schema.define identity', () => {
	const value: unknown = Schema.define({
		className: 'Post',
		fields: () => ({}),
	})

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
		fields: (field) => ({
			id: field.string(),
		}),
	})
	// @ts-expect-error -- UltimaBase owns the createdAt field.
	Schema.define({
		className: 'InvalidCreatedAt',
		fields: (field) => ({
			createdAt: field.string(),
		}),
	})
	// @ts-expect-error -- UltimaBase owns the updatedAt field.
	Schema.define({
		className: 'InvalidUpdatedAt',
		fields: (field) => ({
			updatedAt: field.string(),
		}),
	})
	// @ts-expect-error -- Where logical keys cannot collide with schema fields.
	Schema.define({
		className: 'InvalidWhereLogicalKey',
		fields: (field) => ({
			AND: field.string(),
		}),
	})
	Schema.define({
		className: 'InvalidField',
		fields: () => ({
			// @ts-expect-error -- Schema properties must use field definitions.
			title: 'string',
		}),
	})
	Schema.define({
		className: 'InvalidExtension',
		fields: () => ({}),
		extensions: [
			// @ts-expect-error -- Field extensions cannot attach to a schema.
			defineFieldExtension('fixture.field', {}),
		],
	})
})
