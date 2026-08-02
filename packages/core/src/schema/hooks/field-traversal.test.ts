import { describe, expect, it } from 'vitest'

import { objectField, stringField } from '../../index.js'
import { collectFieldHookDeclarations } from './field-traversal.js'

describe('field hook declaration traversal', () => {
	it('collects nested declarations in stable parent-first depth-first order', () => {
		const fields = {
			profile: objectField({
				list: [true, true],
				fields: {
					displayName: stringField({
						hooks: { validate: () => undefined },
					}),
					contact: objectField({
						fields: {
							'email.address': stringField({
								hooks: {
									resolveInput: ({ value }) => value.trim(),
								},
							}),
						},
						hooks: { beforeSave: () => undefined },
					}),
				},
				hooks: { afterSave: () => undefined },
			}),
		}

		const entries = collectFieldHookDeclarations(fields)

		expect(entries.map(({ path }) => path)).toStrictEqual([
			['profile'],
			['profile', 'displayName'],
			['profile', 'contact'],
			['profile', 'contact', 'email.address'],
		])
		expect(entries.every(Object.isFrozen)).toBe(true)
		expect(entries.every(({ path }) => Object.isFrozen(path))).toBe(true)
	})
})
