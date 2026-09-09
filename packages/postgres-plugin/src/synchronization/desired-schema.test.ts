import { Schema } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { compilePostgresSchema } from '../schema/schema-compiler.js'
import { createPostgresPointerFixture } from '../schema/pointer-fixture.test-support.js'
import { compileDesiredPostgresTables } from './desired-schema.js'

describe('desired PostgreSQL schema', () => {
	it('keeps schema synchronization unchanged when only virtual fields change', () => {
		const persisted = Schema.define({
			className: 'VirtualDesiredFixture',
			fields: (field) => ({ title: field.string({ required: true }) }),
		})
		const withVirtual = Schema.define({
			className: 'VirtualDesiredFixture',
			fields: (field) => ({
				title: field.string({ required: true }),
				summary: field.virtual({
					output: (output) => output.string({ nullable: false }),
					select: { title: true },
					resolve: async ({ item }) => Promise.resolve(String(item.title)),
				}),
			}),
		})
		const persistedDesired = compileDesiredPostgresTables([
			compilePostgresSchema(persisted),
		])
		const virtualDesired = compileDesiredPostgresTables([
			compilePostgresSchema(withVirtual),
		])

		expect(virtualDesired).toStrictEqual(persistedDesired)
		expect(JSON.stringify(virtualDesired)).not.toContain('summary')
	})

	it('detaches managed pointer foreign keys from Drizzle metadata', () => {
		const { catalog, Post } = createPostgresPointerFixture()
		const compiled = catalog.get(Post)
		const [table] = compileDesiredPostgresTables([compiled])
		const [drizzleForeignKey] = getTableConfig(compiled.table).foreignKeys

		expect(table?.foreignKeys).toStrictEqual([
			{
				column: 'author',
				name: drizzleForeignKey?.getName(),
				onDelete: 'cascade',
				targetColumn: 'id',
				targetTable: 'pointer_users',
			},
		])
	})

	it('detaches columns, defaults, identities, renames, and indexes', () => {
		const schema = compilePostgresSchema(
			Schema.define({
				className: 'Article',
				fields: (field) => ({
					budget: field.decimal({ precision: 12, scale: 2 }),
					sequence: field.int({ autoIncrement: true }),
					title: field.string({
						default: "editor's draft",
						postgres: { renamedFrom: 'headline' },
						indexed: 'unique',
					}),
				}),
			}),
		)

		const [table] = compileDesiredPostgresTables([schema])

		expect(table).toBeDefined()
		expect(table?.name).toBe('articles')
		expect(table?.columns.slice(0, 3)).toMatchObject([
			{ name: 'budget', type: 'numeric(12, 2)' },
			{ identity: 'byDefault', name: 'sequence', type: 'bigint' },
			{
				defaultExpression: "'editor''s draft'::text",
				name: 'title',
				renamedFrom: 'headline',
				type: 'text',
			},
		])
		expect(table?.indexes).toMatchObject([{ columns: ['title'], unique: true }])
	})
})
