// A live list's messages applied (D-154): by id, after another row, under a
// connection or in an array, and out of step when a row is not in the list.
import { describe, expect, it } from 'vitest'
import { applyLive } from './apply.ts'

const row = (id: string, title = id) => ({ id, title })
const edge = (id: string, title = id) => ({
	cursor: `c${id}`,
	node: row(id, title),
})

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
