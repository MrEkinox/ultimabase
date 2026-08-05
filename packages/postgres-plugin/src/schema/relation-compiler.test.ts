import { SchemaRegistry, type DatabaseRelationScope } from '@ultimabase/core'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { compileDesiredPostgresTables } from '../synchronization/desired-schema.js'
import { PostgresSchemaCatalog } from './catalog.js'
import {
	PostgresRelationArticle,
	PostgresRelationAuthor,
	PostgresRelationPost,
	PostgresRelationTag,
} from './relation-fixture.test-support.js'

const createCatalog = (): PostgresSchemaCatalog => {
	const schemas = [
		PostgresRelationArticle,
		PostgresRelationTag,
		PostgresRelationAuthor,
		PostgresRelationPost,
	] as const
	const registry = new SchemaRegistry(schemas)

	return new PostgresSchemaCatalog(
		registry.values(),
		registry.resolveSchemaTargets(),
	)
}

describe('PostgreSQL relation compilation', () => {
	it('creates one cascade-cleaned owning join with both traversal indexes', () => {
		const catalog = createCatalog()
		const [join] = catalog.relationValues()

		expect(join).toBeDefined()
		if (join === undefined) return

		const config = getTableConfig(join.table)

		expect(config.columns.map(({ name }) => name)).toStrictEqual([
			'source_id',
			'target_id',
		])
		expect(
			join.indexes.map(({ fields, unique }) => ({ fields, unique })),
		).toStrictEqual([
			{ fields: ['source_id', 'target_id'], unique: true },
			{ fields: ['source_id'], unique: false },
			{ fields: ['target_id'], unique: false },
		])
		expect(join.foreignKeys).toMatchObject([
			{ column: 'source_id', targetTable: 'postgres_relation_articles' },
			{ column: 'target_id', targetTable: 'postgres_relation_tags' },
		])
		expect(catalog.relationValues()).toHaveLength(1)
	})

	it('orients an inverse join to its owner and maps inverse pointers in place', () => {
		const catalog = createCatalog()
		const owning = catalog.getRelation({
			fieldPath: ['tags'],
			source: PostgresRelationArticle,
			sourceObjectId: '018f0f8c-7b5a-7cc9-98db-123456789abc',
			target: PostgresRelationTag,
		})
		const inverseScope: DatabaseRelationScope = {
			fieldPath: ['articles'],
			source: PostgresRelationTag,
			sourceObjectId: '018f0f8c-7b5a-7cc9-98db-123456789abd',
			target: PostgresRelationArticle,
		}
		const inverse = catalog.getRelation(inverseScope)
		const pointerInverse = catalog.getRelation({
			fieldPath: ['posts'],
			source: PostgresRelationAuthor,
			sourceObjectId: '018f0f8c-7b5a-7cc9-98db-123456789abe',
			target: PostgresRelationPost,
		})

		expect(owning.storage.kind).toBe('join')
		expect(inverse.storage.kind).toBe('join')
		if (owning.storage.kind === 'join' && inverse.storage.kind === 'join') {
			expect(inverse.storage.relation).toBe(owning.storage.relation)
			expect(inverse.storage.sourceColumn).toBe(owning.storage.targetColumn)
			expect(inverse.storage.targetColumn).toBe(owning.storage.sourceColumn)
		}
		expect(pointerInverse.storage.kind).toBe('pointer')
	})

	it('generates RQB v2 definitions for joins, inverses, and pointers', () => {
		const catalog = createCatalog()
		const owning = catalog.getRelationDefinition(
			PostgresRelationArticle,
			['tags'],
			PostgresRelationTag,
		)
		const inverse = catalog.getRelationDefinition(
			PostgresRelationTag,
			['articles'],
			PostgresRelationArticle,
		)
		const pointerInverse = catalog.getRelationDefinition(
			PostgresRelationAuthor,
			['posts'],
			PostgresRelationPost,
		)
		const definitions = catalog.drizzleRelationDefinitions()

		for (const relation of [owning, inverse, pointerInverse]) {
			const binding = catalog.getDrizzleRelation(relation)
			const source = definitions[binding.sourceTableKey]
			const target = definitions[binding.targetTableKey]

			expect(source?.relations[binding.sourceRelationName]?.relationType).toBe(
				'many',
			)
			expect(target?.relations[binding.reverseRelationName]?.relationType).toBe(
				relation.storage.kind === 'pointer' ? 'one' : 'many',
			)
		}
	})

	it('adds hidden joins to the managed direct-synchronization model', () => {
		const catalog = createCatalog()
		const desired = compileDesiredPostgresTables(
			catalog.values(),
			catalog.relationValues(),
		)
		const join = desired.find((table) =>
			table.columns.some(({ name }) => name === 'source_id'),
		)

		expect(join).toMatchObject({
			columns: [
				{ name: 'source_id', nullable: false, type: 'uuid' },
				{ name: 'target_id', nullable: false, type: 'uuid' },
			],
			foreignKeys: [{ onDelete: 'cascade' }, { onDelete: 'cascade' }],
		})
		expect(catalog.tableNames()).toContain(join?.name)
	})
})
