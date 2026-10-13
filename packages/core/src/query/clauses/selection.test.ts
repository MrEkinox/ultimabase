import { describe, expect, it } from 'vitest'

import { normalizeQuerySelection } from './selection.js'
import { SchemaRegistry } from '../../schema/index.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const postSchema = UltimaBase.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string(),
		published: field.boolean({ default: false }),
	}),
})

const Tag = UltimaBase.Schema.define({
	className: 'SelectionTag',
	fields: (field) => ({ name: field.string() }),
})

const Article = UltimaBase.Schema.define({
	className: 'SelectionArticle',
	fields: (field) => ({
		title: field.string(),
		tags: field.relation({ target: () => Tag }),
	}),
})

new SchemaRegistry([Tag, Article]).resolveSchemaTargets()

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
		expect(selection.fields).toStrictEqual([
			{ kind: 'selected-field', field: 'title' },
			{ kind: 'selected-field', field: 'id' },
		])
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
			// @ts-expect-error -- Source typing rejects unknown fields; Runtime also protects JavaScript callers.
			normalizeQuerySelection(postSchema, { missing: true })
		}).toThrow(new TypeError('selection.missing must reference a schema field'))
		expect(() =>
			normalizeQuerySelection(postSchema, {
				title: false,
				published: false,
				// @ts-expect-error -- Runtime rejects JavaScript callers too.
				id: false,
				createdAt: false,
				updatedAt: false,
			}),
		).toThrow(new TypeError('selection.id cannot be false'))
		expect(
			normalizeQuerySelection(postSchema, {
				title: false,
				published: false,
				createdAt: false,
				updatedAt: false,
			}).fields,
		).toStrictEqual([{ kind: 'selected-field', field: 'id' }])
	})

	it('rejects relations, which are read through include', () => {
		const relation = new TypeError(
			'selection.tags must not reference a relation; read relations through include',
		)

		expect(() =>
			// @ts-expect-error -- Source typing rejects relations in select.
			normalizeQuerySelection(Article, { title: true, tags: true }),
		).toThrow(relation)
		expect(() =>
			// @ts-expect-error -- Runtime rejects an excluded relation as well.
			normalizeQuerySelection(Article, { tags: false }),
		).toThrow(relation)
		// Exclusion mode starts from the selectable fields only.
		expect(
			normalizeQuerySelection(Article, { title: false }).fields,
		).toStrictEqual([
			{ kind: 'selected-field', field: 'id' },
			{ kind: 'selected-field', field: 'createdAt' },
			{ kind: 'selected-field', field: 'updatedAt' },
		])
	})
})
