import {
	collectQueryRelationPredicates,
	QueryBuilder,
	SchemaRegistry,
} from '@ultimabase/core'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { PostgresSchemaCatalog } from '../schema/catalog.js'
import {
	PostgresRelationArticle,
	PostgresRelationAuthor,
	PostgresRelationPost,
	PostgresRelationTag,
} from '../../tests/fixtures/relation-fixture.js'
import { compilePostgresFilter } from './filter-compiler.js'
import { createPostgresRelationPredicateCompiler } from './relation-predicate-compiler.js'

const relationSchemas = [
	PostgresRelationArticle,
	PostgresRelationTag,
	PostgresRelationAuthor,
	PostgresRelationPost,
] as const
const registry = new SchemaRegistry(relationSchemas)
const catalog = new PostgresSchemaCatalog(
	registry.values(),
	registry.resolveSchemaTargets(),
)
const dialect = new PgDialect()

const renderScoped = <
	TSource extends
		| typeof PostgresRelationArticle
		| typeof PostgresRelationAuthor
		| typeof PostgresRelationTag,
>(
	query: QueryBuilder<TSource>,
	scopeId: string,
) => {
	const expression = query.ast.where?.expression

	if (expression === undefined) {
		throw new TypeError('Scoped relation predicate fixture is incomplete')
	}

	const predicates = collectQueryRelationPredicates(expression)
	const scopes = predicates.map((predicate) => {
		const rowFilter = new QueryBuilder(predicate.target.definition).where({
			id: { ne: scopeId },
		}).ast.where?.expression

		if (rowFilter === undefined) {
			throw new TypeError('Scoped relation target filter is incomplete')
		}

		return { predicate, rowFilter }
	})
	const compiler = createPostgresRelationPredicateCompiler(catalog, scopes)

	return dialect.sqlToQuery(
		compilePostgresFilter(
			expression,
			catalog.get(query.ast.schema.definition),
			compiler,
		),
	)
}

describe('PostgreSQL contextual relation predicate compilation', () => {
	it('applies private scopes to owning, inverse, and inverse-pointer predicates', () => {
		const owning = renderScoped(
			new QueryBuilder(PostgresRelationArticle).where({
				tags: { every: { id: { ne: 'caller-owning' } } },
			}),
			'scope-owning',
		)
		const inverse = renderScoped(
			new QueryBuilder(PostgresRelationTag).where({
				articles: { some: { id: { eq: 'caller-inverse' } } },
			}),
			'scope-inverse',
		)
		const inversePointer = renderScoped(
			new QueryBuilder(PostgresRelationAuthor).where({
				posts: {
					count: {
						where: { id: { ne: 'caller-pointer' } },
						gte: 2,
					},
				},
			}),
			'scope-pointer',
		)

		expect(owning.sql.toLowerCase()).toContain('not (exists')
		expect(owning.params).toEqual(
			expect.arrayContaining(['scope-owning', 'caller-owning']),
		)
		expect(inverse.sql.toLowerCase()).toContain('exists')
		expect(inverse.params).toEqual(
			expect.arrayContaining(['scope-inverse', 'caller-inverse']),
		)
		expect(inversePointer.sql).toContain('select count(*)')
		expect(inversePointer.sql).not.toContain('inner join')
		expect(inversePointer.params).toEqual(
			expect.arrayContaining(['scope-pointer', 'caller-pointer', 2]),
		)
	})
})
