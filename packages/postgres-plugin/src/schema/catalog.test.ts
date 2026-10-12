import { UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { postgresPlugin } from '../plugin/postgres-plugin.js'
import { PostgresSchemaCatalog } from './catalog.js'

const PostgresSchemaApplication = UltimaBase.use(
	postgresPlugin({ url: 'postgresql://fixture' }),
)

describe('PostgreSQL schema catalog', () => {
	it('returns an immutable managed table-name snapshot in schema order', () => {
		const article = UltimaBase.Schema.define({
			className: 'Article',
			fields: (field) => ({ title: field.string() }),
		})
		const audit = PostgresSchemaApplication.Schema.define({
			className: 'Audit',
			fields: () => ({}),
		}).with({
			postgres: { table: 'Exact-Audit' },
		})
		const catalog = new PostgresSchemaCatalog([article, audit])
		const names = catalog.tableNames()

		// Ownership checks use physical identifiers rather than logical class names.
		expect(names).toStrictEqual(['articles', 'Exact-Audit'])
		expect(Object.isFrozen(names)).toBe(true)
	})
})
