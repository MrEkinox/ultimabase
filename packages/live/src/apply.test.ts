// A live list's messages applied (D-154): by id, after another row, under a
// connection or in an array, and out of step when a row is not in the list.
import { describe, expect, it } from 'vitest'
import type { LiveChange } from './apply.ts'
import { applyLive } from './apply.ts'

const row = (id: string, title = id) => ({ id, title })
const edge = (id: string, title = id) => ({
	cursor: `c${id}`,
	node: row(id, title),
})

type Row = ReturnType<typeof row>
const isRow = (value: unknown): value is Row =>
	typeof value === 'object' && value !== null && 'id' in value

/** What changes mean, one scan a lookup: what `applyLive` must always give. */
const plainly = (rows: readonly Row[], changes: readonly LiveChange[]) => {
	const next = [...rows]
	const at = (id: string) => next.findIndex((each) => each.id === id)
	for (const change of changes) {
		if ('remove' in change) {
			const index = at(change.remove)
			if (index < 0) return undefined
			next.splice(index, 1)
			continue
		}
		if (!isRow(change.upsert)) throw new Error('Not a row.')
		const index = at(change.upsert.id)
		if (index >= 0) next.splice(index, 1)
		const after = change.after === null ? -1 : at(change.after)
		if (change.after !== null && after < 0) return undefined
		next.splice(after + 1, 0, change.upsert)
	}
	return next
}

/** `size` rows `r0`, `r1`..., counting how often an id is read. */
const counted = (size: number) => {
	const reads = { count: 0 }
	const rows = Array.from({ length: size }, (_, index) => ({
		get id() {
			reads.count += 1
			return `r${index}`
		},
		title: `r${index}`,
	}))
	return { reads, rows }
}

describe('applyLive', () => {
	it('places, moves and removes rows in an array', () => {
		const list = [row('a'), row('b'), row('c')]
		const next = applyLive(list, {
			revision: 2,
			changes: [
				{ remove: 'b', gone: true },
				{ upsert: row('d'), after: 'a' },
				{ upsert: row('c', 'C'), after: null },
			],
		})
		expect(next).toEqual([row('c', 'C'), row('a'), row('d')])
		expect(list).toEqual([row('a'), row('b'), row('c')])
	})

	it('places edges by their node, and replaces pageInfo and totalCount', () => {
		const pageInfo = { hasNextPage: true }
		const list = { edges: [edge('a'), edge('b')], pageInfo, totalCount: 2 }
		expect(
			applyLive(list, {
				revision: 3,
				changes: [{ upsert: edge('a', 'A'), after: 'b' }],
				pageInfo: { hasNextPage: false },
				totalCount: 3,
			}),
		).toEqual({
			edges: [edge('b'), edge('a', 'A')],
			pageInfo: { hasNextPage: false },
			totalCount: 3,
		})
		// A message with no changes keeps the rows and what it does not name.
		expect(applyLive(list, { revision: 3 })).toEqual(list)
		expect(
			applyLive({ totalCount: 2 }, { revision: 3, totalCount: 1 }),
		).toEqual({
			totalCount: 1,
		})
	})

	it('is out of step when a message names a row the list does not hold', () => {
		const list = [row('a')]
		expect(applyLive(list, { revision: 2, changes: [{ remove: 'x' }] })).toBe(
			undefined,
		)
		expect(
			applyLive(
				{ edges: [edge('a')] },
				{ revision: 2, changes: [{ upsert: edge('b'), after: 'x' }] },
			),
		).toBe(undefined)
	})

	it('finds rows moved by the changes before them', () => {
		const list = ['a', 'b', 'c', 'd', 'e'].map((id) => row(id))
		expect(
			applyLive(list, {
				revision: 2,
				changes: [
					{ upsert: row('n'), after: null },
					{ remove: 'a' },
					{ upsert: row('c', 'C'), after: 'n' },
					{ upsert: row('b', 'B'), after: 'c' },
				],
			}),
		).toEqual([row('n'), row('c', 'C'), row('b', 'B'), row('d'), row('e')])
	})

	it('gives what plain scans give, on any changes', () => {
		let seed = 42
		const below = (limit: number) => {
			seed = (seed * 48_271) % 2_147_483_647
			return seed % limit
		}
		let outOfStep = 0
		for (let run = 0; run < 500; run += 1) {
			const rows = Array.from({ length: below(12) }, (_, index) =>
				row(`r${index}`),
			)
			const changes: LiveChange[] = []
			let held: readonly Row[] = rows
			for (let left = below(12); left > 0; left -= 1) {
				const some = () =>
					below(30) === 0
						? 'ghost'
						: (held[below(Math.max(held.length, 1))]?.id ?? 'ghost')
				const kind = below(4)
				const change: LiveChange =
					kind === 0
						? { remove: some() }
						: {
								upsert: row(
									kind === 1 ? `n${run}-${left}` : some(),
									`t${left}`,
								),
								after: below(5) === 0 ? null : some(),
							}
				changes.push(change)
				const after = plainly(held, [change])
				if (after === undefined) break
				held = after
			}
			const expected = plainly(rows, changes)
			if (expected === undefined) outOfStep += 1
			expect(applyLive(rows, { revision: 2, changes })).toEqual(expected)
		}
		// Both ways a message ends are met.
		expect(outOfStep).toBeGreaterThan(20)
		expect(outOfStep).toBeLessThan(480)
	})

	it('reads a list once for a page of new rows', () => {
		const { reads, rows } = counted(1000)
		const changes = Array.from({ length: 25 }, (_, index) => ({
			upsert: row(`n${index}`),
			after: index === 0 ? 'r999' : `n${index - 1}`,
		}))
		const next = applyLive(rows, { revision: 2, changes })
		expect(next?.length).toBe(1025)
		expect(next?.at(-1)).toEqual(row('n24'))
		expect(reads.count).toBeLessThan(1100)
	})

	it('reads a list once for many rows that do not move', () => {
		const { reads, rows } = counted(1000)
		const changes = Array.from({ length: 200 }, (_, index) => ({
			upsert: row(`r${index * 5}`, 'T'),
			after: index === 0 ? null : `r${index * 5 - 1}`,
		}))
		const next = applyLive(rows, { revision: 2, changes })
		expect(next?.length).toBe(1000)
		expect(next?.[5]).toEqual(row('r5', 'T'))
		// A row no change names stays the same object.
		expect(next?.[6]).toBe(rows[6])
		expect(reads.count).toBeLessThan(1500)
	})

	it("needs each row's id", () => {
		const message = { revision: 2, changes: [{ remove: 'a' }] }
		expect(() => applyLive([{ title: 'a' }], message)).toThrow(
			"Select the node's id to follow a live list.",
		)
		expect(() => applyLive({ edges: [{ cursor: 'c' }] }, message)).toThrow(
			"Select the node's id to follow a live list.",
		)
		expect(() => applyLive([null], message)).toThrow(
			"Select the node's id to follow a live list.",
		)
	})
})
