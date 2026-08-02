import {
	Query,
	queryCursorVersion,
	type QueryCursorPayload,
} from '@ultimabase/query'
import {
	dateTimeField,
	Schema,
	intField,
	stringField,
} from '@ultimabase/schema'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { compilePostgresSchema } from '../schema/schema-compiler.js'
import { compilePostgresQueryClauses } from './clause-compiler.js'

const ArticleSchema = new Schema({
	className: 'Article',
	fields: {
		created: dateTimeField(),
		rank: intField(),
		title: stringField({ validation: { nullable: true } }),
	},
})

const compiledSchema = compilePostgresSchema(ArticleSchema)
const dialect = new PgDialect()
const render = (expression: Parameters<PgDialect['sqlToQuery']>[0]) =>
	dialect.sqlToQuery(expression)

describe('PostgreSQL query clause compiler', () => {
	it('loads only explicit selections and retains normalized offset clauses', () => {
		const query = new Query(ArticleSchema)
			.select('id', 'title')
			.descending('rank')
			.ascending('title')
			.limit(20)
			.skip(40)
		const clauses = compilePostgresQueryClauses(query.ast, compiledSchema)

		expect(Object.keys(clauses.selection)).toStrictEqual(['id', 'title'])
		expect(clauses.limit).toBe(20)
		expect(clauses.offset).toBe(40)
		expect(clauses.orderBy.map((order) => render(order).sql)).toStrictEqual([
			'"articles"."rank" desc NULLS FIRST',
			'"articles"."title" asc NULLS LAST',
		])
	})

	it('loads every compiled field when no selection is declared', () => {
		const clauses = compilePostgresQueryClauses(
			new Query(ArticleSchema).ast,
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
		const query = new Query(ArticleSchema)
			.equalTo('rank', 10)
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
			'"articles"."created" desc NULLS FIRST',
			'"articles"."id" desc NULLS FIRST',
		])
		expect(render(where)).toMatchObject({
			params: [
				10,
				'2026-08-01T10:00:00.000Z',
				'2026-08-01T10:00:00.000Z',
				'018f0f8c-7b5a-7cc9-98db-123456789abc',
			],
		})
		expect(render(where).sql).toMatch(/< \$2.*or.*= \$3.*< \$4/u)
	})

	it('uses id ascending for the first cursor page without explicit ordering', () => {
		const clauses = compilePostgresQueryClauses(
			new Query(ArticleSchema).after().ast,
			compiledSchema,
		)

		expect(clauses.orderBy.map((order) => render(order).sql)).toStrictEqual([
			'"articles"."id" asc NULLS LAST',
		])
		expect(clauses.where).toBeUndefined()
	})

	it('resumes nullable ordering without skipping the non-null descending page', () => {
		const query = new Query(ArticleSchema)
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

		expect(render(where).sql).toMatch(/is not null.*or.*is null.*< \$1/u)
	})

	it('rejects missing, extra, or incompatible authenticated payloads', () => {
		const query = new Query(ArticleSchema)
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
				new Query(ArticleSchema).ast,
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
				{ direction: 'ascending', field: 'rank', value: null },
				{ direction: 'ascending', field: 'id', value: 'id-1' },
			],
			version: queryCursorVersion,
		}

		expect(() =>
			compilePostgresQueryClauses(query.ast, compiledSchema, invalidValue),
		).toThrow(new TypeError('PostgreSQL cursor value cannot be null'))
	})
})
