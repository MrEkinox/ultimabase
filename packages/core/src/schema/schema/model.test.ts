import { describe, expect, it } from 'vitest'

import { Query } from '../../query/query/query.js'
import { objectField } from '../fields/builtins/object.js'
import { stringField } from '../fields/builtins/string.js'
import { Schema } from './definition.js'
import { isSchemaModelInstance, materializeSchemaModel } from './model.js'

const Post = Schema.define({
	className: 'Post',
	fields: {
		title: stringField({ validation: { required: true } }),
		summary: stringField({ validation: { nullable: true } }),
		profile: objectField({
			fields: {
				displayName: stringField({ validation: { required: true } }),
			},
		}),
	},
})

describe('schema model classes', () => {
	it('constructs immutable detached drafts without performing I/O', () => {
		const profile = { displayName: 'Initial' }
		const draft = new Post({
			profile,
			summary: null,
			title: 'Hello',
		})

		profile.displayName = 'Changed'

		expect(draft).toBeInstanceOf(Post)
		expect(draft.title).toBe('Hello')
		expect(draft.profile).toStrictEqual({ displayName: 'Initial' })
		expect(draft.get('summary')).toBeNull()
		expect(draft.toJSON()).toStrictEqual({
			profile: { displayName: 'Initial' },
			summary: null,
			title: 'Hello',
		})
		expect(Object.isFrozen(draft)).toBe(true)
		expect(Object.isFrozen(draft.profile)).toBe(true)
		expect(isSchemaModelInstance(Post, draft)).toBe(true)
		expect(isSchemaModelInstance(Post, draft.toJSON())).toBe(false)
		expect(isSchemaModelInstance(Post, 'not-a-model')).toBe(false)
		expect(Reflect.set(draft, 'title', 'Changed')).toBe(false)
		expect(() => draft.get('missing' as 'title')).toThrow(
			new TypeError('Schema model field is not visible: missing'),
		)

		const prototype = Reflect.getPrototypeOf(draft)

		if (prototype === null) {
			throw new TypeError('Schema model instance must have a prototype')
		}

		const detachedGet: unknown = Reflect.get(prototype, 'get')

		if (typeof detachedGet !== 'function') {
			throw new TypeError('Schema model prototype must expose get')
		}

		// Borrowed methods cannot turn structurally similar objects into trusted models.
		expect((): void => {
			Reflect.apply(detachedGet, {}, ['title'])
		}).toThrow(
			new TypeError('Schema model instance has no trusted model state'),
		)
	})

	it('rejects malformed drafts and public subclass construction', () => {
		expect(() => new Post(null as unknown as { title: string })).toThrow(
			new TypeError('Schema model input must be a plain object'),
		)
		expect(() => new Post({} as { title: string })).toThrow(
			new TypeError('Schema model input field is required: title'),
		)
		expect(
			() => new Post({ title: 'Hello', unknown: true } as { title: string }),
		).toThrow(
			new TypeError('Schema model input contains an unknown field: unknown'),
		)
		const symbolField = Symbol('unknown')
		const symbolInput = { [symbolField]: true, title: 'Hello' }

		expect(() => new Post(symbolInput as { title: string })).toThrow(
			new TypeError(
				'Schema model input contains an unknown field: Symbol(unknown)',
			),
		)

		class ExtendedPost extends Post {}

		expect(() => new ExtendedPost({ title: 'Hello' })).toThrow(
			new TypeError('Schema model classes cannot be subclassed'),
		)
		expect(Schema.is(ExtendedPost)).toBe(false)
	})

	it('materializes only visible Runtime values as persisted class instances', () => {
		const selected = materializeSchemaModel(Post, {
			id: '0198f090-2a50-7000-8000-000000000032',
			title: 'Selected',
		})

		expect(selected).toBeInstanceOf(Post)
		expect(selected.toJSON()).toStrictEqual({
			id: '0198f090-2a50-7000-8000-000000000032',
			title: 'Selected',
		})
		expect(selected).not.toHaveProperty('summary')
		expect(Object.keys(selected)).toStrictEqual(['id', 'title'])
		expect({ ...selected }).toStrictEqual({
			id: '0198f090-2a50-7000-8000-000000000032',
			title: 'Selected',
		})
		expect(JSON.stringify(selected)).toBe(
			'{"id":"0198f090-2a50-7000-8000-000000000032","title":"Selected"}',
		)
		expect(() => selected.get('summary' as 'title')).toThrow(
			new TypeError('Schema model field is not visible: summary'),
		)
		expect(() => materializeSchemaModel(Post, { unknown: true })).toThrow(
			new TypeError(
				'Persisted schema model contains an unknown field: unknown',
			),
		)
		expect(() => materializeSchemaModel(Post, [])).toThrow(
			new TypeError('Persisted schema model values must be a plain object'),
		)
		expect(() =>
			materializeSchemaModel(Post, { [Symbol('unknown')]: true }),
		).toThrow(
			new TypeError(
				'Persisted schema model contains an unknown field: Symbol(unknown)',
			),
		)

		const foreignSchema = (() => undefined) as unknown as typeof Post

		expect(() => materializeSchemaModel(foreignSchema, {})).toThrow(
			new TypeError('Schema model class was not created by Schema.define'),
		)
	})

	it('creates independent Query branches from the static entry point', () => {
		const first = Post.query().select('id', 'title')
		const second = Post.query().equalTo('title', 'Second')

		expect(first).toBeInstanceOf(Query)
		expect(first.schema).toBe(Post)
		expect(first.ast.selection.fields).toStrictEqual([
			{ field: 'id', kind: 'selected-field' },
			{ field: 'title', kind: 'selected-field' },
		])
		expect(second.ast.selection.fields).toStrictEqual([])
		expect(first.ast.where).toBeUndefined()
	})
})
