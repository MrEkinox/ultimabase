import { UltimaBase } from '@ultimabase/core'
import { drizzle } from 'drizzle-orm/node-postgres'
import { pgTable, text } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import type {
	PostgresPool,
	PostgresPoolClient,
} from './connection/contracts.js'
import {
	resolvePostgresRenamedFrom,
	resolvePostgresTableName,
} from './options.js'
import { postgresPlugin } from './plugin/postgres-plugin.js'

class FixturePool implements PostgresPool {
	connect(): Promise<PostgresPoolClient> {
		throw new TypeError('Naming tests do not connect')
	}

	end(): Promise<void> {
		return Promise.resolve()
	}

	query(): Promise<{ readonly rows: readonly unknown[] }> {
		return Promise.resolve({ rows: [] })
	}
}

const schemaNamed = (className: string) =>
	UltimaBase.Schema.define({ className, fields: () => ({}) })
const PostgresSchemaApplication = UltimaBase.use(
	postgresPlugin({ pool: new FixturePool() }),
)

const hasErrorCauseMessage = (error: unknown, message: string): boolean => {
	let candidate = error

	while (candidate instanceof Error) {
		if (candidate.message === message) return true
		candidate = candidate.cause
	}

	return false
}

describe('direct PostgreSQL options', () => {
	it.each([
		['BlogPost', 'blog_posts'],
		['Person', 'people'],
		['Category', 'categories'],
		['News', 'news'],
	])('maps %s to %s without an override', (className, tableName) => {
		expect(resolvePostgresTableName(schemaNamed(className))).toBe(tableName)
	})

	it('preserves and escapes an unrestricted table identifier exactly', async () => {
		const name = 'Tenant.Logs "archive"'
		const schema = PostgresSchemaApplication.Schema.define({
			className: 'PostgresExactTable',
			fields: () => ({}),
			postgres: { table: name },
		})
		const application = new PostgresSchemaApplication({ schemas: [schema] })
		await application.initialize()
		const table = pgTable(resolvePostgresTableName(schema), { id: text('id') })
		const query = drizzle.mock().select({ id: table.id }).from(table).toSQL()

		expect(resolvePostgresTableName(schema)).toBe(name)
		expect(Object.isFrozen(Reflect.get(schema.definition, 'postgres'))).toBe(
			true,
		)
		expect(query).toStrictEqual({
			params: [],
			sql: 'select "id" from "Tenant.Logs ""archive"""',
		})

		await application.dispose()
	})

	it('preserves exact column rename intent', async () => {
		const schema = PostgresSchemaApplication.Schema.define({
			className: 'PostgresExactRename',
			fields: (field) => ({
				title: field.string({
					postgres: { renamedFrom: 'Legacy title' },
				}),
			}),
		})
		const application = new PostgresSchemaApplication({ schemas: [schema] })
		await application.initialize()
		const title = schema.fields.title

		if (title === undefined) {
			throw new TypeError('PostgreSQL rename test field is unavailable')
		}

		expect(resolvePostgresRenamedFrom(title)).toBe('Legacy title')
		expect(Object.isFrozen(Reflect.get(title.options, 'postgres'))).toBe(true)

		await application.dispose()
	})

	it.each([
		{
			postgres: null,
			message: 'PostgresMalformed.postgres must be a plain object',
		},
		{
			postgres: { table: '' },
			message: 'PostgresMalformed.postgres.table must be a non-empty string',
		},
		{
			postgres: { namespace: 'public', table: 'posts' },
			message: 'Unknown PostgresMalformed.postgres key: namespace',
		},
	])(
		'rejects malformed schema option $postgres',
		async ({ message, postgres }) => {
			const schema = PostgresSchemaApplication.Schema.define({
				className: 'PostgresMalformed',
				fields: () => ({}),
				postgres,
			} as never)

			await expect(
				new PostgresSchemaApplication({
					logger: false,
					schemas: [schema],
				}).initialize(),
			).rejects.toSatisfy((error: unknown) =>
				hasErrorCauseMessage(error, message),
			)
		},
	)

	it.each([
		{
			postgres: null,
			message:
				'PostgresMalformedField.fields.title.options.postgres must be a plain object',
		},
		{
			postgres: { renamedFrom: '' },
			message:
				'PostgresMalformedField.fields.title.options.postgres.renamedFrom must be a non-empty string',
		},
		{
			postgres: { column: 'title', renamedFrom: 'headline' },
			message:
				'Unknown PostgresMalformedField.fields.title.options.postgres key: column',
		},
	])(
		'rejects malformed field option $postgres',
		async ({ message, postgres }) => {
			const schema = PostgresSchemaApplication.Schema.define({
				className: 'PostgresMalformedField',
				fields: (field) => ({
					title: field.string({ postgres } as never),
				}),
			})

			await expect(
				new PostgresSchemaApplication({
					logger: false,
					schemas: [schema],
				}).initialize(),
			).rejects.toSatisfy((error: unknown) =>
				hasErrorCauseMessage(error, message),
			)
		},
	)

	it('rejects a direct option when the PostgreSQL plugin is missing', async () => {
		const schema = UltimaBase.Schema.define({
			className: 'PostgresMissingPlugin',
			fields: () => ({}),
			postgres: { table: 'missing_plugin' },
		} as never)

		await expect(
			new UltimaBase({ schemas: [schema] }).initialize(),
		).rejects.toThrow('Unknown schema option: postgres')
	})
})
