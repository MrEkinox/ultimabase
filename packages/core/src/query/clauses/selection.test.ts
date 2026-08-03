import { booleanField, Schema, stringField } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { normalizeQuerySelection } from './selection.js'

const postSchema = Schema.define({
	className: 'Post',
	fields: {
		title: stringField(),
		published: booleanField({ default: false }),
	},
})

describe('normalizeQuerySelection', () => {
	it('keeps the first occurrence of every schema field', () => {
		const fields = ['title', 'id', 'title', 'createdAt'] as const
		const selection = normalizeQuerySelection(postSchema, fields)

		expect(selection).toStrictEqual({
			kind: 'selection',
			fields: [
				{ kind: 'selected-field', field: 'title' },
				{ kind: 'selected-field', field: 'id' },
				{ kind: 'selected-field', field: 'createdAt' },
			],
		})
		expect(fields).toStrictEqual(['title', 'id', 'title', 'createdAt'])
	})

	it('freezes normalized nodes and shares the immutable empty selection', () => {
		const firstEmpty = normalizeQuerySelection(postSchema, [])
		const secondEmpty = normalizeQuerySelection(postSchema, [])
		const selection = normalizeQuerySelection(postSchema, ['title'])

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
		}).toThrow(new TypeError('selection fields must be an array'))
		expect(() => {
			// @ts-expect-error -- Runtime normalization validates every array item.
			normalizeQuerySelection(postSchema, [null])
		}).toThrow(new TypeError('selection.fields[0] must be a non-empty string'))
		expect(() => {
			// @ts-expect-error -- Runtime normalization rejects undeclared fields.
			normalizeQuerySelection(postSchema, ['missing'])
		}).toThrow(
			new TypeError('selection.fields[0] must reference a schema field'),
		)
	})
})
