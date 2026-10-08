import { describe, expect, it } from 'vitest'

import { collectFieldTraversalEntries } from './traversal.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

describe('field traversal', () => {
	it('collects immutable paths in parent-first depth-first declaration order', () => {
		const schema = UltimaBase.Schema.define({
			className: 'TraversalFixture',
			fields: (field) => ({
				'display.name': field.string(),
				profile: field.object({
					list: true,
					fields: (field) => ({
						'email.address': field.string(),
						contact: field.object({
							fields: (field) => ({ phone: field.string() }),
						}),
					}),
				}),
				status: field.string(),
			}),
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

	it('collects a declared __proto__ object child field', () => {
		const schema = UltimaBase.Schema.define({
			className: 'TraversalProtoFixture',
			fields: (field) => ({
				profile: field.object({
					// A computed key declares an own `__proto__` property.
					fields: (field) => ({ ['__proto__']: field.string() }),
				}),
			}),
		})

		expect(
			collectFieldTraversalEntries(schema.fields).map(({ path }) => path),
		).toStrictEqual([
			['profile'],
			['profile', '__proto__'],
			['id'],
			['createdAt'],
			['updatedAt'],
		])
	})
})
