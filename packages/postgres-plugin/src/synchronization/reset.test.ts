import { describe, expect, it } from 'vitest'

import { resetPostgresTables } from './reset.js'

const recordingPool = () => {
	const statements: string[] = []
	return {
		statements,
		pool: {
			connect: () => Promise.reject(new Error('unused')),
			end: () => Promise.resolve(),
			query: (statement: string) => {
				statements.push(statement)
				return Promise.resolve({ rows: [] })
			},
		},
	}
}

describe('resetPostgresTables (ADR-0327)', () => {
	it('empties every managed table in one statement and restarts identities', async () => {
		const { pool, statements } = recordingPool()
		await resetPostgresTables(pool, {
			tableNames: () => ['todos', 'todo_tags', 'auth "sessions"'],
		})
		expect(statements).toStrictEqual([
			'TRUNCATE TABLE "todos", "todo_tags", "auth ""sessions""" RESTART IDENTITY',
		])
	})

	it('sends nothing for an application without tables', async () => {
		const { pool, statements } = recordingPool()
		await resetPostgresTables(pool, { tableNames: () => [] })
		expect(statements).toStrictEqual([])
	})
})
