import { SchemaRegistry } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { PostgresSchemaCatalog } from '../schema/catalog.js'
import {
	PostgresRelationArticle,
	PostgresRelationTag,
} from '../schema/relation-fixture.test-support.js'
import {
	createPostgresDrizzleClient,
	type PostgresDriverQueryClient,
} from './client.js'
import { executePostgresRelationMutation } from './relation-executor.js'

/** Rejects accidental execution because invalid deltas must fail before SQL. */
class RejectingRelationQueryClient implements PostgresDriverQueryClient {
	query(...arguments_: never[]): never {
		void arguments_
		throw new TypeError('Invalid relation deltas must not execute SQL')
	}
}

const registry = new SchemaRegistry([
	PostgresRelationArticle,
	PostgresRelationTag,
])
const catalog = new PostgresSchemaCatalog(
	registry.values(),
	registry.resolveSchemaTargets(),
)
const relation = catalog.getRelation({
	fieldPath: ['tags'],
	source: PostgresRelationArticle,
	sourceObjectId: '018f0f8c-7b5a-7cc9-98db-123456789ad1',
	target: PostgresRelationTag,
})
const client = createPostgresDrizzleClient(new RejectingRelationQueryClient())
const target = PostgresRelationTag.pointer(
	'018f0f8c-7b5a-7cc9-98db-123456789ad2',
)

describe('PostgreSQL relation executor', () => {
	it('rejects forged cardinality and duplicate targets before SQL', async () => {
		const invalidDeltas: readonly unknown[] = [
			{ action: 'clear', targets: [target] },
			{ action: 'connect', targets: [] },
			{ action: 'disconnect', targets: [] },
			{ action: 'set', targets: [target, target] },
		]

		for (const delta of invalidDeltas) {
			await expect(
				executePostgresRelationMutation(
					client,
					relation,
					{
						kind: 'update-expression',
						operations: [{ field: 'tags', kind: 'relation', value: delta }],
					},
					'018f0f8c-7b5a-7cc9-98db-123456789ad1',
				),
			).rejects.toBeInstanceOf(TypeError)
		}
	})
})
