import { Schema, stringField } from '@ultimabase/schema'
import { describe, expect, it } from 'vitest'

import { postgresTable } from '../naming/table.js'
import { PostgresSchemaCatalog } from './catalog.js'

describe('PostgreSQL schema catalog', () => {
	it('returns an immutable managed table-name snapshot in schema order', () => {
		const article = new Schema({
			className: 'Article',
			fields: { title: stringField() },
		})
		const audit = new Schema({
			className: 'Audit',
			fields: {},
			extensions: [postgresTable({ name: 'Exact-Audit' })],
		})
		const catalog = new PostgresSchemaCatalog([article, audit])
		const names = catalog.tableNames()

		// Ownership checks use physical identifiers rather than logical class names.
		expect(names).toStrictEqual(['articles', 'Exact-Audit'])
		expect(Object.isFrozen(names)).toBe(true)
	})
})
