import { describe, expect, it } from 'vitest'

import { Schema, defineSchemaExtension, stringField } from '../index.js'

describe('schema definitions', () => {
	it('keeps Schema itself as a non-constructible static declaration facade', () => {
		expect((): void => {
			Reflect.construct(Schema, [])
		}).toThrow(
			new TypeError('Use Schema.define() to declare a schema model class'),
		)
	})

	it('copies and freezes developer-owned declaration containers', () => {
		const title = stringField()
		const fields: Record<string, typeof title> = { title }
		const extension = defineSchemaExtension('fixture.permissions', {
			mode: 'strict',
		})
		const extensions = [extension]
		const schema = Schema.define({
			className: 'Post',
			fields,
			extensions,
		})

		fields.summary = stringField()
		extensions.push(extension)

		expect(schema.className).toBe('Post')
		expect(schema.name).toBe('Post')
		expect(typeof schema).toBe('function')
		expect(Schema.is(schema)).toBe(true)
		expect(Schema.is(schema.definition)).toBe(false)
		expect(Schema.is({ className: 'Post', fields: schema.fields })).toBe(false)
		expect(schema.fields.title).toBe(title)
		expect(schema.definition.fields).toBe(schema.fields)
		expect(schema.definition.indexes).toBe(schema.indexes)
		expect(schema.definition.extensions).toBe(schema.extensions)
		expect(schema.fields).not.toHaveProperty('summary')
		expect(schema.extensions).toStrictEqual([extension])
		expect(Object.keys(schema)).toStrictEqual([
			'definition',
			'className',
			'fields',
			'indexes',
			'extensions',
		])
		expect(Object.isFrozen(schema)).toBe(true)
		expect(Object.isFrozen(schema.definition)).toBe(true)
		expect(Object.isFrozen(schema.prototype)).toBe(true)
		expect(Object.isFrozen(schema.fields)).toBe(true)
		expect(Object.isFrozen(schema.extensions)).toBe(true)
		expect(Reflect.set(schema, 'className', 'Changed')).toBe(false)
		expect(Reflect.set(schema.fields, 'title', stringField())).toBe(false)
	})

	it('normalizes omitted extensions to one immutable empty list', () => {
		const schema = Schema.define({
			className: 'Post',
			fields: {
				title: stringField(),
			},
		})

		// Consumers can inspect extensions without branching on optional metadata.
		expect(schema.extensions).toStrictEqual([])
		expect(Object.isFrozen(schema.extensions)).toBe(true)
	})

	it.each(['id', 'createdAt', 'updatedAt'] as const)(
		'rejects the reserved %s field',
		(name) => {
			const field = stringField()
			const fields: Record<string, typeof field> = {
				[name]: field,
			}

			expect(() =>
				Schema.define({
					className: 'Invalid',
					fields,
				}),
			).toThrow(new TypeError(`Reserved schema field: ${name}`))
		},
	)

	it.each(['create', 'delete', 'get', 'then', 'toJSON', 'update', 'upsert'])(
		'rejects the reserved model member %s',
		(name) => {
			expect(() =>
				Schema.define({
					className: 'InvalidModel',
					fields: { [name]: stringField() },
				}),
			).toThrow(new TypeError(`Reserved schema model field: ${name}`))
		},
	)
})
