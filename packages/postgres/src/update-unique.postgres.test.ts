// An update or an upsert by a unique field other than `id` loads no row
// (D-341): its locked check and its change share one statement, as an
// update by id does (D-99).
import { testApplication } from '@ultimabase/testing'
import { defineApp, defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { createAdapter } from './adapter.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }
/** The statements the adapter sent. */
const sent: string[] = []
const database = createAdapter({
	url: server,
	log: (event) => sent.push(event.query.sql),
})

const Badge = defineModel({
	name: 'Badge',
	fields: (f) => ({
		slug: f.string({ unique: true }),
		uses: f.number({ integer: true, default: 0 }),
		label: f.string({ optional: true, validate: (value) => value }),
		owner: f.one(() => Owner, { optional: true }),
	}),
})

const Owner = defineModel({
	name: 'Owner',
	fields: (f) => ({ name: f.string() }),
})

const news = {
	where: { slug: 'news' },
	create: { slug: 'news', uses: 1 },
	update: { uses: { increment: 1 } },
	select: { uses: true },
} as const

/** The statements `write` sends. */
async function statements(write: () => Promise<unknown>): Promise<number> {
	sent.length = 0
	await write()
	return sent.length
}

describe('writes by a unique field that load no row', () => {
	testApplication(defineApp({ database, models: [Badge, Owner] }), {
		database: 'declared',
	})

	it('updates by a unique field in one statement, as by id', async () => {
		const { id } = await Badge.create({ data: { slug: 'news' } }, M)
		const data = { uses: { increment: 1 } }
		const byId = await statements(async () =>
			Badge.update({ where: { id }, data }, M),
		)
		const bySlug = await statements(async () =>
			Badge.update({ where: { slug: 'news' }, data }, M),
		)
		expect([byId, bySlug]).toStrictEqual([1, 1])
		const [badge] = await Badge.findMany({ select: { uses: true } }, M)
		expect(badge).toStrictEqual({ uses: 2 })
	})

	it('reads first when the data changes the field or writes a relation', async () => {
		await Badge.create({ data: { slug: 'news' } }, M)
		const owner = await Owner.create({ data: { name: 'Ada' } }, M)
		const renamed = await statements(async () =>
			Badge.update({ where: { slug: 'news' }, data: { slug: 'old' } }, M),
		)
		const owned = await statements(async () =>
			Badge.update(
				{
					where: { slug: 'old' },
					data: { owner: { connect: { id: owner.id } } },
				},
				M,
			),
		)
		expect(renamed).toBeGreaterThan(1)
		expect(owned).toBeGreaterThan(1)
	})

	it('upserts a row it finds in one statement, and creates in two', async () => {
		const created = await statements(async () => Badge.upsert(news, M))
		const updated = await statements(async () => Badge.upsert(news, M))
		expect([created, updated]).toStrictEqual([2, 1])
		const [badge] = await Badge.findMany({ select: { uses: true } }, M)
		expect(badge).toStrictEqual({ uses: 2 })
	})

	it('reads first an upsert whose update data runs a validate', async () => {
		await Badge.create({ data: { slug: 'news' } }, M)
		const labelled = { ...news, update: { label: 'x' } }
		expect(
			await statements(async () => Badge.upsert(labelled, M)),
		).toBeGreaterThan(1)
	})
})
