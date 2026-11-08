// Updates and upserts by a unique field other than `id` that load no row
// (D-341): a locked check stands for the read, and the branch that does not
// run checks nothing (D-142).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { query } from './engine.ts'
import { defineApp, defineModel, master, memory } from './index.ts'

const M = { as: master }
const log: string[] = []

const Badge = defineModel({
	name: 'Badge',
	fields: (f) => ({
		slug: f.string({ unique: true }),
		uses: f.number({ integer: true, default: 0 }),
		hidden: f.boolean({ default: false }),
		label: f.string({
			optional: true,
			validate: (value) => {
				log.push(`validate ${value}`)
				return value
			},
		}),
		owner: f.one(() => Owner, { optional: true }),
	}),
}).with({
	hooks: { beforeFind: ({ where }) => where({ hidden: false }) },
})

const Owner = defineModel({
	name: 'Owner',
	fields: (f) => ({ name: f.string() }),
})

const news = {
	where: { slug: 'news' },
	create: { slug: 'news', uses: 1 },
	update: { uses: { increment: 1 } },
	select: { slug: true, uses: true },
} as const

let app: ReturnType<typeof defineApp>
beforeEach(async () => {
	log.length = 0
	app = defineApp({ database: memory(), models: [Badge, Owner] })
	await app.start()
})
afterEach(async () => app.stop())

describe('an update by a unique field (D-341)', () => {
	it('updates the row it finds', async () => {
		await Badge.create({ data: { slug: 'news', uses: 4 } }, M)
		const badge = await Badge.update(
			{ where: { slug: 'news' }, data: { uses: { increment: 1 } } },
			M,
		)
		expect(badge).toMatchObject({ slug: 'news', uses: 5 })
	})

	it('returns the row its update hides (D-86)', async () => {
		await Badge.create({ data: { slug: 'news' } }, M)
		const badge = await Badge.update(
			{ where: { slug: 'news' }, data: { hidden: true } },
			M,
		)
		expect(badge).toMatchObject({ slug: 'news', hidden: true })
	})

	it('finds no row that is missing or that beforeFind hides', async () => {
		const missing = Badge.update(
			{ where: { slug: 'news' }, data: { uses: 1 } },
			M,
		)
		await expect(missing).rejects.toMatchObject({ code: 'NOT_FOUND' })
		await Badge.create({ data: { slug: 'news', hidden: true } }, M)
		const hidden = Badge.update(
			{ where: { slug: 'news' }, data: { uses: 1 } },
			M,
		)
		await expect(hidden).rejects.toMatchObject({ code: 'NOT_FOUND' })
	})

	it('changes the field it is found by, or a relation, after a read', async () => {
		await Badge.create({ data: { slug: 'news' } }, M)
		const owner = await Owner.create({ data: { name: 'Ada' } }, M)
		const moved = await Badge.update(
			{
				where: { slug: 'news' },
				data: { slug: 'old', owner: { connect: { id: owner.id } } },
				include: { owner: { select: { name: true } } },
			},
			M,
		)
		expect(moved).toMatchObject({ slug: 'old', owner: { name: 'Ada' } })
	})
})

describe('an upsert by a unique field (D-341)', () => {
	it('updates the row it finds', async () => {
		await Badge.create({ data: { slug: 'news', uses: 4 } }, M)
		expect(await Badge.upsert(news, M)).toStrictEqual({
			slug: 'news',
			uses: 5,
		})
		expect(await Badge.count({}, M)).toBe(1)
	})

	it('creates the row it does not find', async () => {
		expect(await Badge.upsert(news, M)).toStrictEqual({
			slug: 'news',
			uses: 1,
		})
		expect(await Badge.count({}, M)).toBe(1)
	})

	it('creates a row beforeFind hides, which its unique index refuses', async () => {
		await Badge.create({ data: { slug: 'news', hidden: true } }, M)
		await expect(Badge.upsert(news, M)).rejects.toMatchObject({
			code: 'UNIQUE_VIOLATION',
		})
	})

	it('validates the update data only when the update runs (D-142)', async () => {
		const labelled = { ...news, update: { label: 'kept' } }
		await Badge.upsert(labelled, M)
		expect(log).toStrictEqual([])
		await Badge.upsert(labelled, M)
		expect(log).toStrictEqual(['validate kept'])
	})

	it('refuses an update value that does not fit only when the update runs', async () => {
		const args = { ...news, update: { uses: 1.5 } }
		const made = await query('Badge', 'upsert', args, M)
		expect(made).toStrictEqual({ slug: 'news', uses: 1 })
		await expect(query('Badge', 'upsert', args, M)).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
		})
	})
})
