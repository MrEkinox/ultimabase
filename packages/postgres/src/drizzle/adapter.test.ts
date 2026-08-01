import { Query, type FindOperationAst } from '@ultimabase/query'
import { defineSchema, stringField } from '@ultimabase/schema'
import { drizzle } from 'drizzle-orm/node-postgres'
import { describe, expect, it } from 'vitest'

import { createPostgresDatabaseAdapter } from './adapter.js'

const articleSchema = defineSchema({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
})

describe('internal PostgreSQL database adapter', () => {
	it('retains Drizzle privately and reports pending operation compilers', async () => {
		const client = drizzle.mock()
		const adapter = createPostgresDatabaseAdapter(client)
		const operation = {
			kind: 'find',
			query: new Query(articleSchema).ast,
		} satisfies FindOperationAst<typeof articleSchema>

		expect(adapter.kind).toBe('database-adapter')
		expect(adapter).not.toHaveProperty('getClient')
		await expect(
			adapter.execute({ accessConstraints: [], operation }),
		).rejects.toMatchObject({
			code: 'INTERNAL_ERROR',
			internalDetails: {
				kind: 'postgres-operation-not-implemented',
				operation: 'find',
			},
		})
	})

	it('reports that Runtime transactions belong to their dedicated issue', async () => {
		const adapter = createPostgresDatabaseAdapter(drizzle.mock())

		await expect(adapter.beginTransaction()).rejects.toMatchObject({
			code: 'TRANSACTION_ERROR',
			internalDetails: {
				reason: 'postgres-transactions-not-implemented',
			},
		})
	})
})
