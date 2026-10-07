import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { createPostgresRelationTableName } from '../naming.js'

describe('PostgreSQL relation naming', () => {
	it('keeps physical names deterministic, distinct, and byte safe', () => {
		const name = createPostgresRelationTableName(
			'articles'.repeat(12),
			'tags',
			'targets'.repeat(12),
		)

		expect(Buffer.byteLength(name)).toBeLessThanOrEqual(63)
		expect(createPostgresRelationTableName('articles', 'tags', 'targets')).toBe(
			createPostgresRelationTableName('articles', 'tags', 'targets'),
		)
		expect(
			createPostgresRelationTableName('articles_tags', 'x', 'targets'),
		).not.toBe(createPostgresRelationTableName('articles', 'tags_x', 'targets'))
	})
})
