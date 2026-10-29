// The change feed of the contract (D-154): what each commit changed, once
// committed, and nothing a rollback or a failed write undid.
import type { Adapter, Changed } from 'ultimabase'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	transaction,
} from 'ultimabase'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { silent } from './silent.ts'

const M = { as: master }

const Card = defineModel({
	name: 'Card',
	fields: (f) => ({
		title: f.string({ unique: true }),
		rank: f.number({ integer: true, optional: true }),
		tags: f.many(() => Tag),
	}),
})

const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({ label: f.string(), cards: f.many(() => Card) }),
})

const long = Array.from({ length: 30 }, (_, index) =>
	`field${index}`.padEnd(52, 'x'),
)
const Wide = defineModel({
	name: 'Wide',
	fields: (f) =>
		Object.fromEntries(
			long.map((name) => [name, f.string({ optional: true })]),
		),
})

/** Written last: once its insert arrives, so have the changes before it. */
const Mark = defineModel({
	name: 'Mark',
	fields: (f) => ({ at: f.number({ integer: true }) }),
})

const manifest = {
	name: 'watcher',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}

/** The changes `seen` holds, one entry per kind and target, lists sorted. */
function merged(seen: readonly Changed[]): object[] {
	const entries = new Map<string, { change: Changed; listed?: string[] }>()
	for (const change of seen) {
		const target = 'field' in change ? change.field : change.fields?.toSorted()
		const key = JSON.stringify([change.kind, change.model, target])
		const rows = 'field' in change ? change.pairs : change.ids
		const known = entries.get(key)
		const listed =
			rows === undefined || (known !== undefined && known.listed === undefined)
				? undefined
				: [
						...(known?.listed ?? []),
						...rows.map((row) => (typeof row === 'string' ? row : row.join())),
					]
		entries.set(key, listed === undefined ? { change } : { change, listed })
	}
	return [...entries.values()].map(({ change, listed }) => {
		const { kind, model } = change
		const rows = listed?.toSorted()
		if ('field' in change) return { kind, model, field: change.field, rows }
		return { kind, model, fields: change.fields?.toSorted(), rows }
	})
}

export function feeds(create: () => Adapter): void {
	describe('the change feed', () => {
		let seen: Changed[] = []
		let marks = 0
		let app: ReturnType<typeof defineApp>
		const watcher = definePlugin({
			name: 'watcher',
			manifest,
			changed: (changes) => {
				seen.push(...changes)
			},
		})
		beforeEach(async () => {
			app = defineApp({
				database: create(),
				models: [Card, Tag, Wide, Mark],
				plugins: [watcher.plugin()],
				logger: silent,
			})
			await app.start()
			seen = []
		})
		afterEach(async () => app.stop())

		/** The changes the commits so far made, once all of them arrived. */
		const settled = async (): Promise<object[]> => {
			marks += 1
			const { id } = await Mark.create({ data: { at: marks } }, M)
			await vi.waitFor(() => {
				expect(
					seen.some((change) => 'ids' in change && change.ids?.includes(id)),
				).toBe(true)
			})
			const changes = merged(seen.filter((change) => change.model !== 'Mark'))
			seen = []
			return changes
		}

		it('reports the rows each commit inserted, updated and deleted', async () => {
			const a = await Card.create({ data: { title: 'a' } }, M)
			const b = await Card.create({ data: { title: 'b' } }, M)
			await Card.update({ where: { id: a.id }, data: { rank: 2 } }, M)
			await Card.delete({ where: { id: b.id } }, M)
			expect(await settled()).toEqual([
				{ kind: 'insert', model: 'Card', rows: [a.id, b.id].toSorted() },
				{
					kind: 'update',
					model: 'Card',
					fields: ['rank', 'updatedAt'],
					rows: [a.id],
				},
				{ kind: 'delete', model: 'Card', rows: [b.id] },
			])
		})

		it('reports the links a write added or removed, not those it found', async () => {
			const card = await Card.create({ data: { title: 'a' } }, M)
			const tag = await Tag.create({ data: { label: 'red' } }, M)
			await settled()
			const tags = { connect: [{ id: tag.id }] }
			await Card.update({ where: { id: card.id }, data: { tags } }, M)
			await Card.update({ where: { id: card.id }, data: { tags } }, M)
			const pair = [card.id, tag.id].join()
			const link = { model: 'Card', field: 'tags', rows: [pair] }
			const updated = { kind: 'update', model: 'Card', fields: ['updatedAt'] }
			expect(await settled()).toEqual([
				{ ...updated, rows: [card.id, card.id] },
				{ kind: 'link', ...link },
			])
			const disconnect = [{ id: tag.id }]
			await Card.update(
				{ where: { id: card.id }, data: { tags: { disconnect } } },
				M,
			)
			expect(await settled()).toEqual([
				{ ...updated, rows: [card.id] },
				{ kind: 'unlink', ...link },
			])
		})

		it('reports nothing of a rollback, a failed write or an empty update', async () => {
			await Card.create({ data: { title: 'a' } }, M)
			await settled()
			const failed = transaction(async () => {
				await Card.create({ data: { title: 'b' } }, M)
				throw new Error('Stop.')
			})
			await expect(failed).rejects.toThrow('Stop.')
			const taken = Card.create({ data: { title: 'a' } }, M)
			await expect(taken).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
			await Card.updateMany({ where: { title: 'none' }, data: { rank: 1 } }, M)
			expect(await settled()).toEqual([])
		})

		it("reports a transaction's writes once it commits", async () => {
			const [a, b] = await transaction(async () => [
				await Card.create({ data: { title: 'a' } }, M),
				await Card.create({ data: { title: 'b' } }, M),
			])
			expect(await settled()).toEqual([
				{ kind: 'insert', model: 'Card', rows: [a?.id, b?.id].toSorted() },
			])
		})

		it('lists no ids past a thousand, no fields past their limit', async () => {
			const data = Array.from({ length: 1001 }, (_, index) => ({
				title: `${index}`,
			}))
			await Card.createMany({ data }, M)
			const wide = await Wide.create({ data: {} }, M)
			const set = Object.fromEntries(long.map((name) => [name, 'v']))
			await Wide.update({ where: { id: wide.id }, data: set }, M)
			expect(await settled()).toEqual([
				{ kind: 'insert', model: 'Card', rows: undefined },
				{ kind: 'insert', model: 'Wide', rows: [wide.id] },
				{ kind: 'update', model: 'Wide', fields: undefined, rows: [wide.id] },
			])
		})
	})
}
