import { describe, expect, it } from 'vitest'

import {
	Schema,
	stringField,
	type FieldDefinition,
	type SchemaIndexOptions,
} from '../index.js'
import { normalizeSchemaIndexes } from './indexes.js'

describe('schema indexes', () => {
	it('normalizes field and composite indexes in deterministic order', () => {
		const schema = new Schema({
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
		const schema = new Schema({
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
		const schema = new Schema({
			className: 'Post',
			fields: {
				title: stringField(),
			},
		})

		expect(schema.indexes).toStrictEqual([])
		expect(Object.isFrozen(schema.indexes)).toBe(true)
	})

	it('rejects unknown and repeated composite fields', () => {
		expect(
			() =>
				new Schema({
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

		expect(
			() =>
				new Schema({
					className: 'RepeatedIndexField',
					fields: {
						title: stringField(),
					},
					indexes: [{ fields: ['title', 'title'] }],
				}),
		).toThrow(new TypeError('Duplicate index field: title'))
	})

	it('rejects malformed composite options at runtime', () => {
		expect(
			() =>
				new Schema({
					className: 'InvalidIndexesContainer',
					fields: {},
					// @ts-expect-error -- Runtime validation protects JavaScript callers.
					indexes: {},
				}),
		).toThrow(new TypeError('indexes must be a list'))

		expect(
			() =>
				new Schema({
					className: 'InvalidIndexEntry',
					fields: {},
					// @ts-expect-error -- Runtime validation protects JavaScript callers.
					indexes: [null],
				}),
		).toThrow(new TypeError('indexes[0] must be an object'))

		expect(
			() =>
				new Schema({
					className: 'InvalidIndexFields',
					fields: { idPart: stringField() },
					indexes: [
						{
							// @ts-expect-error -- Runtime validation protects JavaScript callers.
							fields: 'idPart',
						},
					],
				}),
		).toThrow(new TypeError('indexes[0].fields must be a list'))

		expect(
			() =>
				new Schema({
					className: 'InvalidIndexFieldName',
					fields: { idPart: stringField(), tenant: stringField() },
					indexes: [
						{
							// @ts-expect-error -- Runtime validation protects JavaScript callers.
							fields: ['idPart', 42],
						},
					],
				}),
		).toThrow(new TypeError('indexes[0].fields[1] must be a string'))

		expect(
			() =>
				new Schema({
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

		expect(
			() =>
				new Schema({
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
		).toThrow(new TypeError('indexes[0].unique must be a boolean'))
	})

	it('rejects malformed field-level index metadata at runtime', () => {
		const invalidIndexedField: FieldDefinition<'string', string, object> = {
			kind: 'string',
			options: { indexed: 'invalid' },
		}

		// Forged JavaScript metadata must not silently disable an invalid index.
		expect(
			() =>
				new Schema({
					className: 'InvalidFieldIndex',
					fields: { title: invalidIndexedField },
				}),
		).toThrow(new TypeError('fields.title must be created by a field factory'))
		expect(() =>
			normalizeSchemaIndexes({ title: invalidIndexedField }, undefined),
		).toThrow(new TypeError('indexed must be a boolean or "unique"'))
	})
})
