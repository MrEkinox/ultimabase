import { defineSchema, stringField } from '@ultimabase/schema'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { compilePostgresSchema } from './schema-compiler.js'

const readIndexColumnName = (column: unknown): string => {
	if (
		typeof column !== 'object' ||
		column === null ||
		!('name' in column) ||
		typeof column.name !== 'string'
	) {
		throw new TypeError('Expected a named PostgreSQL index column')
	}

	return column.name
}

describe('PostgreSQL index compiler', () => {
	it('compiles ordinary, unique, and composite indexes in normalized order', () => {
		const schema = defineSchema({
			className: 'Article',
			fields: {
				authorId: stringField(),
				slug: stringField({ indexed: 'unique' }),
				title: stringField({ indexed: true }),
			},
			indexes: [
				{ fields: ['authorId', 'createdAt'] },
				{ fields: ['authorId', 'slug'], unique: true },
			],
		})
		const compiled = compilePostgresSchema(schema)
		const drizzleIndexes = getTableConfig(compiled.table).indexes

		expect(
			compiled.indexes.map(({ fields, unique }) => ({ fields, unique })),
		).toStrictEqual([
			{ fields: ['slug'], unique: true },
			{ fields: ['title'], unique: false },
			{ fields: ['authorId', 'createdAt'], unique: false },
			{ fields: ['authorId', 'slug'], unique: true },
		])
		expect(
			drizzleIndexes.map(({ config }) => ({
				columns: config.columns.map(readIndexColumnName),
				name: config.name,
				unique: config.unique,
			})),
		).toStrictEqual(
			compiled.indexes.map(({ fields, name, unique }) => ({
				columns: fields,
				name,
				unique,
			})),
		)
		expect(new Set(compiled.indexes.map(({ name }) => name)).size).toBe(4)
		expect(compiled.indexes.every(({ name }) => name.length <= 63)).toBe(true)
		expect(Object.isFrozen(compiled.indexes)).toBe(true)
	})

	it('retains unique composite columns as a future upsert conflict target', () => {
		const schema = defineSchema({
			className: 'Membership',
			fields: {
				organizationId: stringField(),
				userId: stringField(),
			},
			indexes: [{ fields: ['organizationId', 'userId'], unique: true }],
		})
		const target = compilePostgresSchema(schema).indexes.find(
			({ unique }) => unique,
		)

		// The normalized tuple remains available without reading Drizzle internals later.
		expect(target).toMatchObject({
			fields: ['organizationId', 'userId'],
			unique: true,
		})
		expect(target?.index.config.columns.map(readIndexColumnName)).toStrictEqual(
			['organizationId', 'userId'],
		)
	})

	it('rejects duplicate normalized definitions instead of creating duplicate DDL', () => {
		const schema = defineSchema({
			className: 'DuplicateIndex',
			fields: {
				organizationId: stringField(),
				userId: stringField(),
			},
			indexes: [
				{ fields: ['organizationId', 'userId'] },
				{ fields: ['organizationId', 'userId'] },
			],
		})

		expect(() => compilePostgresSchema(schema)).toThrow(
			/Duplicate PostgreSQL index definition:/u,
		)
	})
})
