import { QueryBuilder, Schema } from '@ultimabase/core'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { compilePostgresSchema } from '../schema/schema-compiler.test-support.js'
import { compilePostgresQueryClauses } from './clause-compiler.js'

const ArticleSchema = Schema.define({
	className: 'Article',
	fields: (field) => ({
		created: field.dateTime(),
		rank: field.int(),
		title: field.string(),
	}),
})

const compiledSchema = compilePostgresSchema(ArticleSchema)
const dialect = new PgDialect()
const render = (expression: Parameters<PgDialect['sqlToQuery']>[0]) =>
	dialect.sqlToQuery(expression)

describe('PostgreSQL query clause compiler', () => {
	it('loads only explicit selections and retains normalized offset clauses', () => {
		const query = new QueryBuilder(ArticleSchema)
			.select({ id: true, title: true })
			.descending('rank')
			.ascending('title')
			.limit(20)
			.offset(40)
		const clauses = compilePostgresQueryClauses(query.ast, compiledSchema)

		expect(Object.keys(clauses.selection)).toStrictEqual(['id', 'title'])
		expect(clauses.limit).toBe(20)
		expect(clauses.offset).toBe(40)
		expect(clauses.orderBy.map((order) => render(order).sql)).toStrictEqual([
			'"articles"."rank" desc NULLS LAST',
			'"articles"."title" asc NULLS LAST',
		])
	})

	it('adds private object identity when an explicit selection omits id', () => {
		const clauses = compilePostgresQueryClauses(
			new QueryBuilder(ArticleSchema).select({ title: true }).ast,
			compiledSchema,
		)

		// The adapter removes this additional id before returning public values.
		expect(Object.keys(clauses.selection)).toStrictEqual(['title', 'id'])
	})

	it('loads every compiled field when no selection is declared', () => {
		const clauses = compilePostgresQueryClauses(
			new QueryBuilder(ArticleSchema).ast,
			compiledSchema,
		)

		expect(Object.keys(clauses.selection)).toStrictEqual([
			'created',
			'rank',
			'title',
			'id',
			'createdAt',
			'updatedAt',
		])
	})
})
