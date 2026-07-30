import { describe, expect, it } from 'vitest'

import {
	defineSchema,
	stringField,
	type SchemaIndexOptions,
} from '../src/index.js'

describe('schema indexes', () => {
	it('normalizes field and composite indexes in deterministic order', () => {
		const schema = defineSchema({
			className: 'Post',
			fields: {
				title: stringField({ indexed: true }),
				slug: stringField({ indexed: 'unique' }),
				summary: stringField({ indexed: false }),
				authorId: stringField(),
			},
			indexes: [
				{ fields: ['authorId', 'createdAt'] },
				{ fields: ['authorId', 'slug'], unique: true },
			],
		})

		expect(schema.indexes).toStrictEqual([
			{ fields: ['title'], unique: false },
			{ fields: ['slug'], unique: true },
			{ fields: ['authorId', 'createdAt'], unique: false },
			{ fields: ['authorId', 'slug'], unique: true },
		])
		expect(Object.isFrozen(schema.indexes)).toBe(true)

		for (const index of schema.indexes) {
			expect(Object.isFrozen(index)).toBe(true)
			expect(Object.isFrozen(index.fields)).toBe(true)
		}
	})

	it('copies caller-owned composite declarations', () => {
		const fields: ['category' | 'title', 'createdAt'] = [
			'category',
			'createdAt',
		]
		const indexes: SchemaIndexOptions<'category' | 'createdAt' | 'title'>[] = [
			{ fields },
		]
		const schema = defineSchema({
			className: 'Post',
			fields: {
				category: stringField(),
				title: stringField(),
			},
			indexes,
		})

		fields[0] = 'title'
		indexes.push({ fields: ['title', 'createdAt'], unique: true })

		expect(schema.indexes).toStrictEqual([
			{ fields: ['category', 'createdAt'], unique: false },
		])
	})

	it('normalizes omitted declarations to one immutable empty list', () => {
		const schema = defineSchema({
			className: 'Post',
			fields: {
				title: stringField(),
			},
		})

		expect(schema.indexes).toStrictEqual([])
		expect(Object.isFrozen(schema.indexes)).toBe(true)
	})

	it('rejects unknown and repeated composite fields', () => {
		expect(() =>
			defineSchema({
				className: 'UnknownIndexField',
				fields: {
					title: stringField(),
				},
				indexes: [
					// @ts-expect-error -- Runtime validation also protects JavaScript callers.
					{ fields: ['title', 'missing'] },
				],
			}),
		).toThrow(new TypeError('Unknown index field: missing'))

		expect(() =>
			defineSchema({
				className: 'RepeatedIndexField',
				fields: {
					title: stringField(),
				},
				indexes: [{ fields: ['title', 'title'] }],
			}),
		).toThrow(new TypeError('Duplicate index field: title'))
	})

	it('rejects malformed composite options at runtime', () => {
		expect(() =>
			defineSchema({
				className: 'ShortIndex',
				fields: {
					title: stringField(),
				},
				indexes: [
					// @ts-expect-error -- Composite indexes require two fields statically.
					{ fields: ['title'] },
				],
			}),
		).toThrow(new TypeError('Composite index must contain at least two fields'))

		expect(() =>
			defineSchema({
				className: 'InvalidUnique',
				fields: {
					slug: stringField(),
					title: stringField(),
				},
				indexes: [
					{
						fields: ['slug', 'title'],
						// @ts-expect-error -- Runtime validation protects untyped callers.
						unique: 'yes',
					},
				],
			}),
		).toThrow(new TypeError('Index unique must be a boolean'))
	})
})
