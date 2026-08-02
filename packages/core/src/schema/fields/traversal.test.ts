import { describe, expect, it } from 'vitest'

import { objectField, Schema, stringField } from '../index.js'
import { collectFieldTraversalEntries } from './traversal.js'

describe('field traversal', () => {
	it('collects immutable paths in parent-first depth-first declaration order', () => {
		const schema = new Schema({
			className: 'TraversalFixture',
			fields: {
				'display.name': stringField(),
				profile: objectField({
					list: true,
					fields: {
						'email.address': stringField(),
						contact: objectField({
							fields: { phone: stringField() },
						}),
					},
				}),
				status: stringField(),
			},
		})

		const entries = collectFieldTraversalEntries(schema.fields)

		expect(entries.map(({ path }) => path)).toStrictEqual([
			['display.name'],
			['profile'],
			['profile', 'email.address'],
			['profile', 'contact'],
			['profile', 'contact', 'phone'],
			['status'],
			['id'],
			['createdAt'],
			['updatedAt'],
		])
		expect(Object.isFrozen(entries)).toBe(true)
		expect(entries.every(Object.isFrozen)).toBe(true)
		expect(entries.every(({ path }) => Object.isFrozen(path))).toBe(true)
	})
})
