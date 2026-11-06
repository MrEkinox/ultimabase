import { createQueryId, PostgresQueryCompiler, sql as kysely } from 'kysely'
import { describe, expect, it } from 'vitest'
import { compiled, sizeOf, sql } from './text.ts'

const compiler = new PostgresQueryCompiler()

/** What Kysely, which still runs them, writes for the same fragments. */
const theirs = (piece: ReturnType<typeof kysely>) => {
	const { sql: text, parameters } = compiler.compileQuery(
		piece.toOperationNode(),
		createQueryId(),
	)
	return { text, parameters: [...parameters] }
}

describe('sql as text', () => {
	it('writes what Kysely writes, parameters numbered in order', () => {
		const ours = sql`select ${sql.join([sql.id('t1', 'id'), sql`${1} + ${2}`])} from ${sql.id('a"b')} as ${sql.id('t1')} where ${sql.join([sql`x = ${'y'}`, sql`z = ${null}`], sql` and `)} ${sql.raw('desc')}`
		const same = kysely`select ${kysely.join([kysely.id('t1', 'id'), kysely`${1} + ${2}`])} from ${kysely.id('a"b')} as ${kysely.id('t1')} where ${kysely.join([kysely`x = ${'y'}`, kysely`z = ${null}`], kysely` and `)} ${kysely.raw('desc')}`
		expect(compiled(ours)).toEqual(theirs(same))
	})

	it('quotes a literal as Kysely does, a number as it is', () => {
		const ours = sql`${sql.join([sql.lit("it's"), sql.lit(3)])}`
		const same = kysely`${kysely.join([kysely.lit("it's"), kysely.lit(3)])}`
		expect(compiled(ours)).toEqual(theirs(same))
	})

	it('joins nothing into nothing', () => {
		expect(compiled(sql`(${sql.join([])})`).text).toBe('()')
	})

	it('counts the parameters a piece binds, nested ones included', () => {
		expect(
			sizeOf(sql`${1} ${sql`${2}, ${sql.id('a')}`} ${sql.join([3, 4])}`),
		).toBe(4)
	})
})
