import { Schema, defineSchemaExtension } from '@ultimabase/core'
import { pgTable, text } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/node-postgres'
import { describe, expect, it } from 'vitest'

import { postgresPluginName, postgresTableExtensionName } from '../constants.js'
import { postgresTable, resolvePostgresTableName } from './table.js'

const schemaNamed = (className: string) =>
	Schema.define({ className, fields: () => ({}) })

describe('PostgreSQL table naming', () => {
	it.each([
		['BlogPost', 'blog_posts'],
		['Person', 'people'],
		['Category', 'categories'],
		['News', 'news'],
	])('maps %s to %s', (className, tableName) => {
		expect(resolvePostgresTableName(schemaNamed(className))).toBe(tableName)
	})

	it('preserves an unrestricted non-empty override exactly', () => {
		const name = 'Tenant.Posts-v2 "archive"'
		const extension = postgresTable({ name })
		const schema = Schema.define({
			className: 'IgnoredClassName',
			fields: () => ({}),
			extensions: [extension],
		})

		expect(resolvePostgresTableName(schema)).toBe(name)
		expect(extension.config.name).toBe(name)
		expect(Object.isFrozen(extension)).toBe(true)
		expect(Object.isFrozen(extension.config)).toBe(true)
	})

	it('lets Drizzle escape an unrestricted override as one identifier', () => {
		const schema = Schema.define({
			className: 'AuditLog',
			fields: () => ({}),
			extensions: [postgresTable({ name: 'Tenant.Logs "archive"' })],
		})
		const table = pgTable(resolvePostgresTableName(schema), {
			id: text('id'),
		})
		const query = drizzle.mock().select({ id: table.id }).from(table).toSQL()

		expect(query).toStrictEqual({
			params: [],
			sql: 'select "id" from "Tenant.Logs ""archive"""',
		})
	})

	it('rejects malformed factory input and forged extension config', () => {
		const invalidCases: readonly {
			readonly create: () => unknown
			readonly message: string
		}[] = [
			{
				create: () => postgresTable(null as never),
				message: 'postgres table options must be a plain object',
			},
			{
				create: () => postgresTable({ name: '' }),
				message: 'postgres table name must be a non-empty string',
			},
			{
				create: () => postgresTable({ name: 42 } as never),
				message: 'postgres table name must be a non-empty string',
			},
			{
				create: () =>
					postgresTable({ name: 'posts', namespace: 'public' } as never),
				message: 'postgres table contains unknown key: namespace',
			},
		]

		for (const invalidCase of invalidCases) {
			expect(invalidCase.create).toThrow(new TypeError(invalidCase.message))
		}

		const forgedExtension = defineSchemaExtension(
			postgresTableExtensionName,
			{ name: '' },
			postgresPluginName,
		)
		const schema = Schema.define({
			className: 'Post',
			fields: () => ({}),
			extensions: [forgedExtension],
		})

		expect(() => resolvePostgresTableName(schema)).toThrow(
			new TypeError('postgres table name must be a non-empty string'),
		)
	})
})
