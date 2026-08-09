import { Schema } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { normalizeQuerySelection } from './selection.js'

const postSchema = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string(),
		published: field.boolean({ default: false }),
	}),
})

describe('normalizeQuerySelection', () => {
	it('uses inclusion mode when at least one field is true', () => {
		const input = { title: true, published: false, id: true } as const
		const selection = normalizeQuerySelection(postSchema, input)

		expect(selection).toStrictEqual({
			kind: 'selection',
			fields: [
				{ kind: 'selected-field', field: 'title' },
				{ kind: 'selected-field', field: 'id' },
			],
		})
		expect(input).toStrictEqual({ title: true, published: false, id: true })
	})

	it('uses exclusion mode when every declared flag is false', () => {
		const selection = normalizeQuerySelection(postSchema, {
			published: false,
			updatedAt: false,
		})

		expect(selection.fields).toStrictEqual([
			{ kind: 'selected-field', field: 'title' },
			{ kind: 'selected-field', field: 'id' },
			{ kind: 'selected-field', field: 'createdAt' },
		])
	})

	it('freezes normalized nodes and shares the immutable empty selection', () => {
		const firstEmpty = normalizeQuerySelection(postSchema, {})
		const secondEmpty = normalizeQuerySelection(postSchema, {})
		const selection = normalizeQuerySelection(postSchema, { title: true })

		expect(firstEmpty).toBe(secondEmpty)
		expect(Object.isFrozen(firstEmpty)).toBe(true)
		expect(Object.isFrozen(firstEmpty.fields)).toBe(true)
		expect(Object.isFrozen(selection)).toBe(true)
		expect(Object.isFrozen(selection.fields)).toBe(true)
		expect(Object.isFrozen(selection.fields[0])).toBe(true)
	})

	it('rejects malformed selections and unknown fields at runtime', () => {
		expect(() => {
			// @ts-expect-error -- Runtime normalization protects JavaScript callers.
			normalizeQuerySelection(postSchema, 'title')
		}).toThrow(new TypeError('query selection must be an object'))
		expect(() => {
			// @ts-expect-error -- Runtime normalization validates every flag.
			normalizeQuerySelection(postSchema, { title: 'yes' })
		}).toThrow(new TypeError('selection.title must be a boolean'))
		expect(() => {
			// @ts-expect-error -- Runtime normalization rejects undeclared fields.
			normalizeQuerySelection(postSchema, { missing: true })
		}).toThrow(new TypeError('selection.missing must reference a schema field'))
		expect(() =>
			normalizeQuerySelection(postSchema, {
				title: false,
				published: false,
				id: false,
				createdAt: false,
				updatedAt: false,
			}),
		).toThrow(new TypeError('query selection must retain at least one field'))
	})
})
