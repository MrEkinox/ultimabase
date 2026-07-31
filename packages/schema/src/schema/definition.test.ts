import { describe, expect, it } from 'vitest'

import { defineSchema, defineSchemaExtension, stringField } from '../index.js'

describe('schema definitions', () => {
	it('copies and freezes developer-owned declaration containers', () => {
		const title = stringField()
		const fields: Record<string, typeof title> = { title }
		const extension = defineSchemaExtension('fixture.permissions', {
			mode: 'strict',
		})
		const extensions = [extension]
		const schema = defineSchema({
			className: 'Post',
			fields,
			extensions,
		})

		fields.summary = stringField()
		extensions.push(extension)

		expect(schema.className).toBe('Post')
		expect(schema.fields.title).toBe(title)
		expect(schema.fields).not.toHaveProperty('summary')
		expect(schema.extensions).toStrictEqual([extension])
		expect(Object.isFrozen(schema)).toBe(true)
		expect(Object.isFrozen(schema.fields)).toBe(true)
		expect(Object.isFrozen(schema.extensions)).toBe(true)
		expect(Reflect.set(schema, 'className', 'Changed')).toBe(false)
		expect(Reflect.set(schema.fields, 'title', stringField())).toBe(false)
	})

	it('normalizes omitted extensions to one immutable empty list', () => {
		const schema = defineSchema({
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
				defineSchema({
					className: 'Invalid',
					fields,
				}),
			).toThrow(new TypeError(`Reserved schema field: ${name}`))
		},
	)
})
