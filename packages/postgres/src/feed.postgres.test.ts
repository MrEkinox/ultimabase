// The change feed on postgres() (D-154): notifications cut to fit 8000 bytes,
// another's ignored, and `missed` once a lost listener is back.
import { testApplication } from '@ultimabase/testing'
import type { Changed } from 'ultimabase'
import { defineApp, defineModel, definePlugin, master } from 'ultimabase'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAdapter } from './adapter.ts'
import { channelOf } from './listen.ts'
import { changedOf } from './notify.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }
const database = createAdapter({ url: server })

const Card = defineModel({
	name: 'Card',
	fields: (f) => ({ title: f.string(), tags: f.many(() => Tag) }),
})

const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({ label: f.string(), cards: f.many(() => Card) }),
})

let seen: Changed[] = []
let missed = 0
const watcher = definePlugin({
	name: 'watcher',
	manifest: {
		name: 'watcher',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	changed: (changes) => {
		seen.push(...changes)
	},
	missed: () => {
		missed += 1
	},
})

/** The ids, or pairs, of the changes of `kind` seen so far. */
const listed = (kind: Changed['kind']): string[] =>
	seen
		.filter((change) => change.kind === kind)
		.flatMap((change) =>
			'field' in change
				? (change.pairs ?? []).map((pair) => pair.join())
				: (change.ids ?? []),
		)

/** How many rows each change lists, fewest first. */
const sizes = (changes: Changed[]): unknown[] =>
	changes
		.map((change) => ('field' in change ? change.pairs : change.ids))
		.map((rows) => rows?.length ?? 0)
		.toSorted((a, b) => a - b)

/** Waits for the insert of a card, written after all that went before. */
async function settled(): Promise<void> {
	const { id } = await Card.create({ data: { title: 'last' } }, M)
	await vi.waitFor(() => expect(listed('insert')).toContain(id))
}

describe('the change feed on postgres()', () => {
	testApplication(
		defineApp({ database, models: [Card, Tag], plugins: [watcher.plugin()] }),
		{ database: 'declared' },
	)
	beforeEach(() => {
		seen = []
		missed = 0
	})

	it('cuts a notification at 150 ids and 75 pairs', async () => {
		const data = Array.from({ length: 400 }, (_, at) => ({ title: `${at}` }))
		await Card.createMany({ data }, M)
		const labels = data.slice(0, 200).map(({ title }) => ({ label: title }))
		await Tag.createMany({ data: labels }, M)
		const tags = await Tag.findMany({ take: 200 }, M)
		const [card] = await Card.findMany({ take: 1 }, M)
		const connect = tags.map(({ id }) => ({ id }))
		await Card.update(
			{ where: { id: card?.id ?? '' }, data: { tags: { connect } } },
			M,
		)
		await settled()
		const inserts = seen.filter(
			(change) => change.kind === 'insert' && change.model === 'Card',
		)
		expect(sizes(inserts)).toEqual([1, 100, 150, 150])
		const links = seen.filter((change) => change.kind === 'link')
		expect(sizes(links)).toEqual([50, 75, 75])
		expect(new Set(listed('link')).size).toBe(200)
	})

	it('ignores a notification it did not send', async () => {
		const [{ schema } = { schema: '' }] = await database.sql<{
			schema: string
		}>`select current_schema() as schema`
		await database.sql`select pg_notify(${channelOf(schema)}, 'not json')`
		await settled()
		expect(seen).toHaveLength(1)
	})

	it('tells it missed changes once a lost listener is back', async () => {
		const [{ ended } = { ended: false }] = await database.sql<{
			ended: boolean
		}>`select bool_or(pg_terminate_backend(pid)) as ended from pg_stat_activity where application_name = 'ultimabase-feed' and query = 'listen "' || 'ultimabase:' || current_schema() || '"'`
		expect(ended).toBe(true)
		await vi.waitFor(() => expect(missed).toBe(1), { timeout: 5000 })
		await settled()
	})
})

describe('a notification', () => {
	it('is a change only when it has the shape of one', () => {
		const refused = [
			'not json',
			'{}',
			'["insert","Card",null]',
			'["drop","Card",null,null]',
			'["insert",1,null,null]',
			'["link","Card",null,null]',
			'["link","Card","tags",[["a"]]]',
			'["insert","Card",[1],null]',
			'["insert","Card",null,[1]]',
		]
		expect(refused.map(changedOf)).toEqual(refused.map(() => undefined))
		expect(changedOf('["update","Card",["title"],["a"]]')).toEqual({
			kind: 'update',
			model: 'Card',
			fields: ['title'],
			ids: ['a'],
		})
		expect(changedOf('["unlink","Card","tags",null]')).toEqual({
			kind: 'unlink',
			model: 'Card',
			field: 'tags',
		})
	})

	it('goes to a channel within the 63 bytes of a name', () => {
		const long = channelOf('s'.repeat(63))
		expect(Buffer.byteLength(long)).toBe(63)
		expect(long).not.toBe(channelOf('t'.repeat(63)))
		expect(channelOf('public')).toBe('ultimabase:public')
	})
})
