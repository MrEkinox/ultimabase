import { describe, expect, it } from 'vitest'

import {
	DuplicateSchemaError,
	SchemaRegistry,
	defineSchema,
	stringField,
} from '../index.js'

const createFixtureSchema = (className: string, fieldName: string) =>
	defineSchema({
		className,
		fields: {
			[fieldName]: stringField(),
		},
	})

describe('SchemaRegistry', () => {
	it('preserves registration order and returns immutable snapshots', () => {
		const userSchema = createFixtureSchema('User', 'name')
		const postSchema = createFixtureSchema('Post', 'title')
		const commentSchema = createFixtureSchema('Comment', 'body')
		const registry = new SchemaRegistry([userSchema, postSchema])

		registry.register(commentSchema)

		const schemas = registry.values()

		expect(registry.size).toBe(3)
		expect(schemas).toStrictEqual([userSchema, postSchema, commentSchema])
		expect(Object.isFrozen(schemas)).toBe(true)
		expect(Reflect.set(schemas, 0, commentSchema)).toBe(false)
		expect(registry.values()).toStrictEqual([
			userSchema,
			postSchema,
			commentSchema,
		])
	})

	it('rejects duplicate class names with a typed error', () => {
		const firstSchema = createFixtureSchema('Post', 'title')
		const duplicateSchema = createFixtureSchema('Post', 'slug')
		const registry = new SchemaRegistry([firstSchema])
		let thrown: unknown

		try {
			registry.register(duplicateSchema)
		} catch (error: unknown) {
			thrown = error
		}

		expect(thrown).toBeInstanceOf(DuplicateSchemaError)
		expect(thrown).toMatchObject({
			name: 'DuplicateSchemaError',
			code: 'SCHEMA_DUPLICATE_CLASS_NAME',
			className: 'Post',
			message: 'Duplicate schema class name: Post',
		})
		// A rejected registration must leave the original owner unchanged.
		expect(registry.size).toBe(1)
		expect(registry.get('Post')).toBe(firstSchema)
	})

	it('retrieves known and dynamically registered schemas', () => {
		const userSchema = createFixtureSchema('User', 'name')
		const postSchema = createFixtureSchema('Post', 'title')
		const registry = new SchemaRegistry([userSchema])

		registry.register(postSchema)

		expect(registry.has('User')).toBe(true)
		expect(registry.has('Post')).toBe(true)
		expect(registry.has('Missing')).toBe(false)
		expect(registry.get('User')).toBe(userSchema)
		expect(registry.get('Post')).toBe(postSchema)
		expect(registry.get('Missing')).toBeUndefined()
	})

	it.concurrent('keeps parallel registry instances isolated', async () => {
		const firstSchema = createFixtureSchema('Shared', 'first')
		const secondSchema = createFixtureSchema('Shared', 'second')
		const firstRegistry = new SchemaRegistry()
		const secondRegistry = new SchemaRegistry()

		// Separate microtasks model independent application setup sharing one process.
		await Promise.all([
			Promise.resolve().then(() => {
				firstRegistry.register(firstSchema)
			}),
			Promise.resolve().then(() => {
				secondRegistry.register(secondSchema)
			}),
		])

		expect(firstRegistry.get('Shared')).toBe(firstSchema)
		expect(secondRegistry.get('Shared')).toBe(secondSchema)
		expect(firstRegistry.values()).not.toBe(secondRegistry.values())
	})
})
