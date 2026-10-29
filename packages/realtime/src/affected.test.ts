// What a flush's changes do to one live read (D-154), on a crafted reach.
import { describe, expect, it } from 'vitest'
import type { Facing, Finder } from './affected.ts'
import { affected } from './affected.ts'
import type { Batch, ModelChanges } from './changes.ts'
import type { LivePlan } from 'ultimabase/internal'
import { reachOf } from './reach.ts'
import { schema } from './test/schema.ts'

const plan = (more: Partial<LivePlan>): LivePlan => ({
	where: undefined,
	rights: undefined,
	orderBy: [{ field: 'id', direction: 'asc' }],
	fields: ['id', 'title'],
	...more,
})

/** A live list of posts p1 and p2; its finder answers `found` outside it. */
const facing = (
	more: Partial<LivePlan>,
	found: readonly string[] = [],
): Facing & { readonly asked: unknown[] } => {
	const asked: unknown[] = []
	const find: Finder = async (steps, ids, within) => {
		asked.push([steps.map(({ relation }) => relation), ids, within])
		return within === undefined ? found : []
	}
	return {
		model: 'Post',
		reach: reachOf(schema, 'Post', plan(more)),
		window: new Set(['p1', 'p2']),
		tracked: new Map([['comments', new Map([['c1', new Set(['p1'])]])]]),
		find,
		asked,
	}
}

const batch = (entries: readonly (readonly [string, ModelChanges])[]): Batch =>
	new Map(entries)

const team = { team: { is: { name: { equals: 'One' } } } }
const comments = { comments: { fields: ['id', 'text'], take: 3 } }

describe('the changes of a live list', () => {
	it('finds the rows a level or a shown relation reaches', async () => {
		const read = facing({ where: team, include: comments }, ['p3'])
		const result = await affected(
			read,
			batch([
				['Post', { deletes: new Set(['p1', 'p9']) }],
				['Team', { updates: new Set(['t1']), fields: new Set(['name']) }],
				[
					'Comment',
					{ updates: new Set(['c1', 'c7']), fields: new Set(['text']) },
				],
			]),
		)
		expect(result).toEqual({
			candidates: new Set(['p3']),
			deleted: new Set(['p1']),
			beyond: true,
			resend: new Set(['p1']),
		})
		expect(read.asked).toEqual([
			[['team'], ['t1'], undefined],
			[['comments'], ['c1', 'c7'], ['p1', 'p2']],
		])
	})

	it('resyncs when a level does not say which rows changed', async () => {
		const read = facing({ where: team })
		const changes = batch([['Team', { updates: 'all', fields: 'all' }]])
		expect(await affected(read, changes)).toBe('resync')
	})

	it('resyncs when a negative level loses a link', async () => {
		const read = facing({ where: { comments: { none: {} } } })
		const changes = batch([['Comment', { deletes: new Set(['c1']) }]])
		expect(await affected(read, changes)).toBe('resync')
	})

	it('sends every row again when a nested filter reaches the change', async () => {
		const include = {
			comments: { where: { post: { is: { tags: { some: {} } } } } },
		}
		const read = facing({ include })
		const changes = batch([['Tag', { inserts: new Set(['x']) }]])
		const result = await affected(read, changes)
		expect(result).toMatchObject({ resend: new Set(['p1', 'p2']) })
	})

	it('sends every row again when a shown relation does not say which rows changed', async () => {
		const read = facing({ include: comments })
		const changes = batch([['Comment', { inserts: 'all' }]])
		const result = await affected(read, changes)
		expect(result).toMatchObject({ resend: new Set(['p1', 'p2']) })
	})
})
