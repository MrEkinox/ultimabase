import { expectTypeOf, test } from 'vitest'

import {
	DuplicateSchemaError,
	SchemaRegistry,
	Schema,
	stringField,
	type SchemaDefinition,
} from '../index.js'

const userSchema = Schema.define({
	className: 'User',
	fields: {
		name: stringField(),
	},
})

const postSchema = Schema.define({
	className: 'Post',
	fields: {
		title: stringField(),
	},
})

test('preserves literal schema types from constructor declarations', () => {
	const registry = new SchemaRegistry([userSchema, postSchema])
	const selectedName: 'Post' | 'User' = Math.random() > 0.5 ? 'User' : 'Post'

	expectTypeOf(registry.get('User')).toEqualTypeOf<
		typeof userSchema | undefined
	>()
	expectTypeOf(registry.get('Post')).toEqualTypeOf<
		typeof postSchema | undefined
	>()
	expectTypeOf(registry.get(selectedName)).toEqualTypeOf<
		typeof postSchema | typeof userSchema | undefined
	>()
	expectTypeOf(registry.get('Unknown')).toEqualTypeOf<
		SchemaDefinition | undefined
	>()
})

test('keeps dynamic registry boundaries safe without inventing literals', () => {
	const registry = new SchemaRegistry()

	registry.register(userSchema)

	expectTypeOf(registry.get('User')).toEqualTypeOf<
		SchemaDefinition | undefined
	>()
	expectTypeOf(registry.has('User')).toEqualTypeOf<boolean>()
	expectTypeOf(registry.size).toEqualTypeOf<number>()
	expectTypeOf(registry.values()).toEqualTypeOf<readonly SchemaDefinition[]>()
})

test('exports a precise duplicate-schema error contract', () => {
	const error = new DuplicateSchemaError('User')

	expectTypeOf(error.code).toEqualTypeOf<'SCHEMA_DUPLICATE_CLASS_NAME'>()
	expectTypeOf(error.className).toEqualTypeOf<string>()
	expectTypeOf(error).toExtend<Error>()
})
