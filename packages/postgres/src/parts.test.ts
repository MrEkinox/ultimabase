import { describe, expect, it } from 'vitest'
import type { Part } from './parts.ts'
import { grouped } from './parts.ts'
import { rows as noted } from './notify.ts'
import { sql } from './text.ts'

/** A part writing `table`, the rows it knows, if any. */
const part = (
	table: string,
	inserts: boolean,
	rows?: readonly string[],
): Part => ({
	build: () => sql`select 1`,
	table,
	key: ['id'],
	inserts,
	removes: false,
	adds: inserts,
	reads: new Set([table]),
	...(rows === undefined ? {} : { rows: new Set(rows) }),
	noted: noted('update', table),
})

/** How many parts each statement holds. */
const sizes = (parts: readonly Part[]): number[] =>
	grouped(parts, () => 65_535).map((group) => group.length)

describe('parts grouped into statements (D-339)', () => {
	it('lets writes of distinct known rows of a table share one', () => {
		const parts = [
			part('a', true, ['1', '2']),
			part('a', false, ['3']),
			part('a', false, ['4']),
		]
		expect(sizes(parts)).toStrictEqual([3])
	})

	it('writes a known row a second time in the next', () => {
		const parts = [
			part('a', true, ['1']),
			part('a', false, ['2']),
			part('a', false, ['1']),
			part('a', false, ['3']),
		]
		expect(sizes(parts)).toStrictEqual([2, 2])
	})

	it('writes apart what does not know its rows', () => {
		const parts = [
			part('a', false, ['1']),
			part('a', false),
			part('a', false, ['2']),
			part('b', false),
		]
		expect(sizes(parts)).toStrictEqual([1, 1, 2])
	})
})
