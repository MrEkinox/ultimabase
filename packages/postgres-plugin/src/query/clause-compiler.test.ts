import {
	QueryBuilder,
	queryCursorVersion,
	type QueryCursorPayload,
} from '@ultimabase/core'
import { Schema } from '@ultimabase/core'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { compilePostgresSchema } from '../schema/schema-compiler.js'
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

	it('adds the UUID tie-breaker and compiles a lexicographic after predicate', () => {
		const query = new QueryBuilder(ArticleSchema)
			.where((where) => where.eq('rank', 10))
			.descending('created')
			.limit(2)
			.after('authenticated-cursor')
		const payload: QueryCursorPayload = {
			className: 'Article',
			ordering: [
				{
					direction: 'descending',
					field: 'created',
					value: '2026-08-01T10:00:00.000Z',
				},
				{
					direction: 'descending',
					field: 'id',
					value: '018f0f8c-7b5a-7cc9-98db-123456789abc',
				},
			],
			version: queryCursorVersion,
		}
		const clauses = compilePostgresQueryClauses(
			query.ast,
			compiledSchema,
			payload,
		)
		const where = clauses.where

		if (where === undefined) {
			throw new TypeError('Cursor fixture requires a where expression')
		}

		expect(clauses.orderBy.map((order) => render(order).sql)).toStrictEqual([
			'"articles"."created" desc NULLS LAST',
			'"articles"."id" desc NULLS LAST',
		])
		expect(render(where)).toMatchObject({
			params: [
				10,
				'2026-08-01T10:00:00.000Z',
				'2026-08-01T10:00:00.000Z',
				'018f0f8c-7b5a-7cc9-98db-123456789abc',
			],
		})
		expect(render(where).sql).toMatch(/< \$2.*is null.*or.*= \$3.*< \$4/u)
	})

	it('uses id ascending for the first cursor page without explicit ordering', () => {
		const clauses = compilePostgresQueryClauses(
			new QueryBuilder(ArticleSchema).after().ast,
			compiledSchema,
		)

		expect(clauses.orderBy.map((order) => render(order).sql)).toStrictEqual([
			'"articles"."id" asc NULLS LAST',
		])
		expect(clauses.where).toBeUndefined()
	})

	it('treats a null descending cursor as terminal under NULLS LAST', () => {
		const query = new QueryBuilder(ArticleSchema)
			.descending('title')
			.after('authenticated-cursor')
		const payload: QueryCursorPayload = {
			className: 'Article',
			ordering: [
				{ direction: 'descending', field: 'title', value: null },
				{
					direction: 'descending',
					field: 'id',
					value: '018f0f8c-7b5a-7cc9-98db-123456789abc',
				},
			],
			version: queryCursorVersion,
		}
		const where = compilePostgresQueryClauses(
			query.ast,
			compiledSchema,
			payload,
		).where

		if (where === undefined) {
			throw new TypeError('Nullable cursor fixture requires a predicate')
		}

		expect(render(where).sql).toMatch(/false.*or.*is null.*< \$1/u)
	})

	it('rejects missing, extra, or incompatible authenticated payloads', () => {
		const query = new QueryBuilder(ArticleSchema)
			.ascending('rank')
			.after('authenticated-cursor')
		const incompatible: QueryCursorPayload = {
			className: 'Other',
			ordering: [
				{ direction: 'ascending', field: 'rank', value: 1 },
				{ direction: 'ascending', field: 'id', value: 'id-1' },
			],
			version: queryCursorVersion,
		}

		expect(() =>
			compilePostgresQueryClauses(query.ast, compiledSchema),
		).toThrow(
			new TypeError(
				'PostgreSQL cursor payload must accompany an after cursor only',
			),
		)
		expect(() =>
			compilePostgresQueryClauses(
				new QueryBuilder(ArticleSchema).ast,
				compiledSchema,
				incompatible,
			),
		).toThrow(
			new TypeError(
				'PostgreSQL cursor payload must accompany an after cursor only',
			),
		)
		expect(() =>
			compilePostgresQueryClauses(query.ast, compiledSchema, incompatible),
		).toThrow(
			new TypeError(
				'PostgreSQL cursor payload does not match the query schema',
			),
		)

		const invalidValue: QueryCursorPayload = {
			className: 'Article',
			ordering: [
				{ direction: 'ascending', field: 'rank', value: 1 },
				{ direction: 'ascending', field: 'id', value: null },
			],
			version: queryCursorVersion,
		}

		expect(() =>
			compilePostgresQueryClauses(query.ast, compiledSchema, invalidValue),
		).toThrow(new TypeError('PostgreSQL cursor value cannot be null'))
	})
})
