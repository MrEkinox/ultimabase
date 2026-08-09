import { expectTypeOf, test } from 'vitest'

import {
	definePlugin,
	Schema,
	stringField,
	type InferCreateInput,
	type SchemaDefinition,
	type SchemaFieldBuilderDeclaration,
} from '../../index.js'

const DeferredArticle = Schema.define({
	className: 'DeferredArticle',
	fields: (field) => ({
		slug: field.string({ validation: { required: true } }),
		title: field.string(),
	}),
	indexes: [{ fields: ['slug', 'createdAt'], unique: true }],
})

test('infers exact schema contracts from a deferred field-map callback', () => {
	expectTypeOf(DeferredArticle.className).toEqualTypeOf<'DeferredArticle'>()
	expectTypeOf<InferCreateInput<typeof DeferredArticle>>().toEqualTypeOf<{
		slug: string
		title?: string | null
	}>()
	expectTypeOf(
		new DeferredArticle({ slug: 'article' }).slug,
	).toEqualTypeOf<string>()
	expectTypeOf(DeferredArticle.fields.title.kind).toEqualTypeOf<'string'>()
})

test('names the field builder declaration contract without widening fields', () => {
	const declaration: SchemaFieldBuilderDeclaration<{
		readonly title: ReturnType<typeof stringField>
	}> = () => ({ title: stringField() })
	const Deferred = Schema.define({
		className: 'NamedDeferredDeclaration',
		fields: declaration,
	})

	expectTypeOf(Deferred).toExtend<SchemaDefinition>()
})

test('exposes only compiled read-only schemas during plugin setup', () => {
	definePlugin({
		name: 'fixture.read-only-compiled-schemas',
		setup: ({ schemas }) => {
			expectTypeOf(schemas.get('DeferredArticle')).toEqualTypeOf<
				SchemaDefinition | undefined
			>()
			expectTypeOf(schemas.schemaTargets.size).toEqualTypeOf<number>()
			expectTypeOf(schemas).not.toHaveProperty('register')
		},
	})
})
