import { describe, expect, it } from 'vitest'

import { objectField, stringField } from '../../index.js'
import { collectFieldHookDeclarations } from './field-traversal.js'

describe('field hook declaration traversal', () => {
	it('collects nested resolveInput declarations in parent-first depth-first order', () => {
		const fields = {
			profile: objectField({
				list: true,
				fields: {
					displayName: stringField({
						hooks: { resolveInput: ({ value }) => value },
					}),
					contact: objectField({
						fields: {
							'email.address': stringField({
								hooks: {
									resolveInput: ({ value }) =>
										value === null ? null : value.trim(),
								},
							}),
						},
						hooks: { resolveInput: ({ value }) => value },
					}),
				},
				hooks: { resolveInput: ({ value }) => value },
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
