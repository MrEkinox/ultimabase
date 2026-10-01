import { SchemaRegistry } from '@ultimabase/core'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { PostgresSchemaCatalog } from '../schema/catalog.js'
import {
	PostgresRelationArticle,
	PostgresRelationAuthor,
	PostgresRelationPost,
	PostgresRelationTag,
} from '../../tests/fixtures/relation-fixture.js'
import { compilePostgresRelationPredicate } from './relation-compiler.js'

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
const dialect = new PgDialect()

const renderRelation = (
	source: (typeof schemas)[number],
	fieldPath: readonly string[],
	target: (typeof schemas)[number],
	sourceObjectId: string,
) =>
	dialect.sqlToQuery(
		compilePostgresRelationPredicate(
			catalog,
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

		expect(owning.sql).toContain('exists (select *')
		expect(owning.sql).toContain('"source_id" = "f0"."id"')
		expect(owning.sql).toContain(
			'"postgres_relation_tags"."id" = "ft0"."target_id"',
		)
		expect(owning.sql).toContain('"f0"."id" = $1')
		expect(owning.params).toStrictEqual([articleId])
		expect(owning.sql).not.toContain(articleId)
		expect(inverse.sql).toContain('exists (select *')
		expect(inverse.sql).toContain('"target_id" = "f0"."id"')
		expect(inverse.sql).toContain(
			'"postgres_relation_articles"."id" = "ft0"."source_id"',
		)
		expect(inverse.sql).toContain('"f0"."id" = $1')
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

		expect(rendered.sql).toContain('exists (select *')
		expect(rendered.sql).toContain(
			'"postgres_relation_posts"."author" = "f0"."id"',
		)
		expect(rendered.sql).toContain('"f0"."id" = $1')
		expect(rendered.params).toStrictEqual([authorId])
		expect(rendered.sql).not.toContain(authorId)
	})
})
