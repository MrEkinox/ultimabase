import { SchemaRegistry } from '@ultimabase/core'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import {
	createPostgresDrizzleClient,
	type PostgresDriverQueryClient,
} from '../drizzle/client.js'
import { PostgresSchemaCatalog } from '../schema/catalog.js'
import {
	PostgresRelationArticle,
	PostgresRelationAuthor,
	PostgresRelationPost,
	PostgresRelationTag,
} from '../schema/relation-fixture.test-support.js'
import { compilePostgresRelationPredicate } from './relation-compiler.js'

/** Supplies Drizzle's query-building surface without allowing unit tests to execute SQL. */
class RelationCompilerQueryClient implements PostgresDriverQueryClient {
	query(...arguments_: never[]): never {
		void arguments_
		throw new TypeError('Relation compiler unit tests must not execute SQL')
	}
}

const schemas = [
	PostgresRelationArticle,
	PostgresRelationTag,
	PostgresRelationAuthor,
	PostgresRelationPost,
] as const
const registry = new SchemaRegistry(schemas)
const catalog = new PostgresSchemaCatalog(
	registry.values(),
	registry.resolveSchemaTargets(),
)
const client = createPostgresDrizzleClient(new RelationCompilerQueryClient())
const dialect = new PgDialect()

const renderRelation = (
	source: (typeof schemas)[number],
	fieldPath: readonly string[],
	target: (typeof schemas)[number],
	sourceObjectId: string,
) =>
	dialect.sqlToQuery(
		compilePostgresRelationPredicate(
			client,
			catalog.getRelation({ fieldPath, source, sourceObjectId, target }),
			sourceObjectId,
		),
	)

describe('PostgreSQL relation predicate compiler', () => {
	it('parameterizes owning and inverse join traversal with opposite orientation', () => {
		const articleId = '018f0f8c-7b5a-7cc9-98db-123456789ac1'
		const tagId = '018f0f8c-7b5a-7cc9-98db-123456789ac2'
		const owning = renderRelation(
			PostgresRelationArticle,
			['tags'],
			PostgresRelationTag,
			articleId,
		)
		const inverse = renderRelation(
			PostgresRelationTag,
			['articles'],
			PostgresRelationArticle,
			tagId,
		)

		expect(owning.sql).toMatch(
			/"id" in \(select "target_id".*"source_id" = \$1/u,
		)
		expect(owning.params).toStrictEqual([articleId])
		expect(owning.sql).not.toContain(articleId)
		expect(inverse.sql).toMatch(
			/"id" in \(select "source_id".*"target_id" = \$1/u,
		)
		expect(inverse.params).toStrictEqual([tagId])
		expect(inverse.sql).not.toContain(tagId)
	})

	it('parameterizes inverse-pointer traversal without a join', () => {
		const authorId = '018f0f8c-7b5a-7cc9-98db-123456789ac3'
		const rendered = renderRelation(
			PostgresRelationAuthor,
			['posts'],
			PostgresRelationPost,
			authorId,
		)

		expect(rendered.sql).toContain('"author" = $1')
		expect(rendered.params).toStrictEqual([authorId])
		expect(rendered.sql).not.toContain(authorId)
	})
})
