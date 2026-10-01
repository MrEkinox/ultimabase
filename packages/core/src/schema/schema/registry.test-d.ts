import { expectTypeOf, test } from 'vitest'

import {
	DuplicateSchemaError,
	SchemaRegistry,
	type SchemaDefinition,
} from '../index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const userSchema = UltimaBase.Schema.define({
	className: 'User',
	fields: (field) => ({
		name: field.string(),
	}),
})

const postSchema = UltimaBase.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string(),
	}),
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
	// @ts-expect-error -- Complete schema compilation no longer accepts a transform callback.
	registry.compileSchemas(undefined, (prepared: readonly never[]) => prepared)
})

test('exports a precise duplicate-schema error contract', () => {
	const error = new DuplicateSchemaError('User')

	expectTypeOf(error.code).toEqualTypeOf<'SCHEMA_DUPLICATE_CLASS_NAME'>()
	expectTypeOf(error.className).toEqualTypeOf<string>()
	expectTypeOf(error).toExtend<Error>()
})
