import { describe, expect, it } from 'vitest'

import { defineSchema } from '../index.js'

describe('system fields', () => {
	it('adds immutable UUID v7 and date-time metadata to every schema', () => {
		const schema = defineSchema({
			className: 'Post',
			fields: {},
		})

		expect(schema.fields).toStrictEqual({
			id: {
				kind: 'uuid',
				options: {
					uuidVersion: 7,
					system: true,
					generatedOn: 'create',
					immutable: true,
					validation: { required: true },
				},
			},
			createdAt: {
				kind: 'dateTime',
				options: {
					system: true,
					generatedOn: 'create',
					immutable: true,
					validation: { required: true },
				},
			},
			updatedAt: {
				kind: 'dateTime',
				options: {
					system: true,
					generatedOn: 'createAndUpdate',
					immutable: true,
					validation: { required: true },
				},
			},
		})

		for (const field of Object.values(schema.fields)) {
			expect(Object.isFrozen(field)).toBe(true)
			expect(Object.isFrozen(field.options)).toBe(true)
			expect(Object.isFrozen(field.options.validation)).toBe(true)
		}
	})

	it('reuses stable system metadata without sharing schema field maps', () => {
		const first = defineSchema({ className: 'First', fields: {} })
		const second = defineSchema({ className: 'Second', fields: {} })

		// System definitions are safe shared values, while each schema owns its field map.
		expect(first.fields).not.toBe(second.fields)
		expect(first.fields.id).toBe(second.fields.id)
		expect(first.fields.createdAt).toBe(second.fields.createdAt)
		expect(first.fields.updatedAt).toBe(second.fields.updatedAt)
	})
})
