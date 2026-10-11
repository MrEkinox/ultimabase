import { UltimaBase } from '@ultimabase/core'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { compilePostgresSchema } from './schema-compiler.test-support.js'
import { createStoredPluginField } from './storage-codec-fixture.test-support.js'

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
	it('uses GIN for non-unique codec-backed JSONB fields', () => {
		const schema = UltimaBase.Schema.define({
			className: 'IndexedPluginValue',
			fields: () => ({ value: createStoredPluginField() }),
		})
		const [compiledIndex] = getTableConfig(
			compilePostgresSchema(schema).table,
		).indexes

		expect(compiledIndex?.config.method).toBe('gin')
		expect(compiledIndex?.config.unique).toBe(false)
		expect(
			compiledIndex?.config.columns.map(readIndexColumnName),
		).toStrictEqual(['value'])
	})

	it('compiles ordinary, unique, and composite indexes in normalized order', () => {
		const schema = UltimaBase.Schema.define({
			className: 'Article',
			fields: (field) => ({
				authorId: field.string(),
				slug: field.string({ indexed: 'unique' }),
				title: field.string({ indexed: true }),
			}),
			indexes: [
				{ fields: ['authorId', 'createdAt'] },
				{ fields: ['authorId', 'slug'], unique: true },
			],
		})
		const compiled = compilePostgresSchema(schema)
		const drizzleIndexes = getTableConfig(compiled.table).indexes

		expect(
			drizzleIndexes.map(({ config }) => ({
				fields: config.columns.map(readIndexColumnName),
				unique: config.unique,
			})),
		).toStrictEqual([
			{ fields: ['slug'], unique: true },
			{ fields: ['title'], unique: false },
			{ fields: ['author_id', 'created_at'], unique: false },
			{ fields: ['author_id', 'slug'], unique: true },
		])
		const names = drizzleIndexes.map(({ config }) => config.name)

		expect(new Set(names).size).toBe(4)
		expect(names.every((name) => name !== undefined && name.length <= 63)).toBe(
			true,
		)
	})

	it('retains unique composite columns as a future upsert conflict target', () => {
		const schema = UltimaBase.Schema.define({
			className: 'Membership',
			fields: (field) => ({
				organizationId: field.string(),
				userId: field.string(),
			}),
			indexes: [{ fields: ['organizationId', 'userId'], unique: true }],
		})
		const target = getTableConfig(
			compilePostgresSchema(schema).table,
		).indexes.find(({ config }) => config.unique)

		// The Drizzle table remains the physical source for later upsert validation.
		expect(target?.config.columns.map(readIndexColumnName)).toStrictEqual([
			'organization_id',
			'user_id',
		])
	})

	it('rejects duplicate normalized definitions instead of creating duplicate DDL', () => {
		const schema = UltimaBase.Schema.define({
			className: 'DuplicateIndex',
			fields: (field) => ({
				organizationId: field.string(),
				userId: field.string(),
			}),
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
