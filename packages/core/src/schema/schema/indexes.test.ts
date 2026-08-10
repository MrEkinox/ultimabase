import { describe, expect, it } from 'vitest'

import {
	Schema,
	SchemaRegistry,
	type FieldDefinition,
	type SchemaIndexOptions,
} from '../index.js'
import { normalizeSchemaIndexes } from './indexes.js'

describe('schema indexes', () => {
	it('normalizes field and composite indexes in deterministic order', () => {
		const schema = Schema.define({
			className: 'Post',
			fields: (field) => ({
				title: field.string({ indexed: true }),
				slug: field.string({ indexed: 'unique' }),
				summary: field.string({ indexed: false }),
				authorId: field.string(),
			}),
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
		const schema = Schema.define({
			className: 'Post',
			fields: (field) => ({
				category: field.string(),
				title: field.string(),
			}),
			indexes,
		})

		fields[0] = 'title'
		indexes.push({ fields: ['title', 'createdAt'], unique: true })

		expect(schema.indexes).toStrictEqual([
			{ fields: ['category', 'createdAt'], unique: false },
		])
	})

	it('normalizes omitted declarations to one immutable empty list', () => {
		const schema = Schema.define({
			className: 'Post',
			fields: (field) => ({
				title: field.string(),
			}),
		})

		expect(schema.indexes).toStrictEqual([])
		expect(Object.isFrozen(schema.indexes)).toBe(true)
	})

	it('rejects unknown and repeated composite fields', () => {
		const relationTarget = Schema.define({
			className: 'RuntimeIndexRelationTarget',
			fields: () => ({}),
		})

		expect(() =>
			Schema.define({
				className: 'UnknownIndexField',
				fields: (field) => ({
					title: field.string(),
				}),
				indexes: [
					// @ts-expect-error -- Runtime validation also protects JavaScript callers.
					{ fields: ['title', 'missing'] },
				],
			}),
		).toThrow(new TypeError('Unknown index field: missing'))

		expect(() =>
			Schema.define({
				className: 'RepeatedIndexField',
				fields: (field) => ({
					title: field.string(),
				}),
				indexes: [{ fields: ['title', 'title'] }],
			}),
		).toThrow(new TypeError('Duplicate index field: title'))

		const relationIndexSchema = Schema.define({
			className: 'RelationIndexField',
			fields: (field) => ({
				title: field.string(),
				targets: field.relation({ target: 'RuntimeIndexRelationTarget' }),
			}),
			indexes: [
				// @ts-expect-error -- Runtime validation protects JavaScript callers.
				{ fields: ['title', 'targets'] },
			],
		})

		expect(() =>
			new SchemaRegistry([
				relationIndexSchema,
				relationTarget,
			]).resolveSchemaTargets(),
		).toThrow(new TypeError('Unknown index field: targets'))
	})

	it('rejects malformed composite options at runtime', () => {
		expect(() =>
			Schema.define({
				className: 'InvalidIndexesContainer',
				fields: () => ({}),
				// @ts-expect-error -- Runtime validation protects JavaScript callers.
				indexes: {},
			}),
		).toThrow(new TypeError('indexes must be a list'))

		expect(() =>
			Schema.define({
				className: 'InvalidIndexEntry',
				fields: () => ({}),
				// @ts-expect-error -- Runtime validation protects JavaScript callers.
				indexes: [null],
			}),
		).toThrow(new TypeError('indexes[0] must be an object'))

		expect(() =>
			Schema.define({
				className: 'InvalidIndexFields',
				fields: (field) => ({ idPart: field.string() }),
				indexes: [
					{
						// @ts-expect-error -- Runtime validation protects JavaScript callers.
						fields: 'idPart',
					},
				],
			}),
		).toThrow(new TypeError('indexes[0].fields must be a list'))

		expect(() =>
			Schema.define({
				className: 'InvalidIndexFieldName',
				fields: (field) => ({ idPart: field.string(), tenant: field.string() }),
				indexes: [
					{
						// @ts-expect-error -- Runtime validation protects JavaScript callers.
						fields: ['idPart', 42],
					},
				],
			}),
		).toThrow(new TypeError('indexes[0].fields[1] must be a string'))

		expect(() =>
			Schema.define({
				className: 'ShortIndex',
				fields: (field) => ({
					title: field.string(),
				}),
				indexes: [
					// @ts-expect-error -- Composite indexes require two fields statically.
					{ fields: ['title'] },
				],
			}),
		).toThrow(new TypeError('Composite index must contain at least two fields'))

		expect(() =>
			Schema.define({
				className: 'InvalidUnique',
				fields: (field) => ({
					slug: field.string(),
					title: field.string(),
				}),
				indexes: [
					{
						fields: ['slug', 'title'],
						// @ts-expect-error -- Runtime validation protects untyped callers.
						unique: 'yes',
					},
				],
			}),
		).toThrow(new TypeError('indexes[0].unique must be a boolean'))
	})

	it('rejects malformed field-level index metadata at runtime', () => {
		const invalidIndexedField: FieldDefinition<'string', string, object> = {
			kind: 'string',
			options: { indexed: 'invalid' },
		}

		// Forged JavaScript metadata must not silently disable an invalid index.
		expect(() =>
			Schema.define({
				className: 'InvalidFieldIndex',
				fields: () => ({ title: invalidIndexedField }),
			}),
		).toThrow(
			new TypeError(
				'InvalidFieldIndex.fields.title must be created by a field factory',
			),
		)
		expect(() =>
			normalizeSchemaIndexes({ title: invalidIndexedField }, undefined),
		).toThrow(new TypeError('indexed must be a boolean or "unique"'))
	})
})
