import { expectTypeOf, test } from 'vitest'

import {
	definePlugin,
	Schema,
	stringField,
	type InferCreateInput,
	type SchemaDefinition,
	type SchemaFieldDeclaration,
} from '../../index.js'

const DeferredArticle = Schema.define({
	className: 'DeferredArticle',
	fields: () => ({
		slug: stringField({ validation: { required: true } }),
		title: stringField(),
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

test('names the temporary deferred declaration contract without widening fields', () => {
	const declaration: SchemaFieldDeclaration<{
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
