import { UltimaBase, databasePersistencePlanCapability } from '@ultimabase/core'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing/plugins'
import { describe, expect, it, onTestFinished } from 'vitest'

import { testDatabaseFilterOperators } from './database-filter-operators.js'
import { MemoryTestDatabase } from './memory-database.js'
import { testDatabasePlugin } from './test-database.js'

const MemoryNote = UltimaBase.Schema.define({
	className: 'MemoryDatabaseNote',
	fields: (field) => ({
		rank: field.int(),
		title: field.string({ required: true }),
	}),
})

const start = async (database = new MemoryTestDatabase()) => {
	const application = new (UltimaBase.use(testDatabasePlugin(database)))({
		logger: false,
		schemas: [MemoryNote],
	})
	onTestFinished(() => application.dispose())
	await application.start()
	return { application, database }
}

const filtering = {
	capabilities: {
		filterOperators: testDatabaseFilterOperators,
		persistencePlans: databasePersistencePlanCapability,
	},
}

describe('MemoryTestDatabase', () => {
	it('conforms to the public plugin kernel contracts', async () => {
		const report = await runPluginConformance(
			definePluginConformanceSuite({
				createFixture: () =>
					createPluginConformanceFixture({
						schemas: [],
						subject: testDatabasePlugin(new MemoryTestDatabase()),
					}),
				expected: {
					core: '^0.0.0',
					pluginId: 'fixture.test-database',
					version: '1.0.0',
				},
			}),
		)

		expect(report.checks.map(({ contract }) => contract)).toContain(
			'lifecycle-cleanup',
		)
	})

	it('answers a write with its selection, `{ id }` by default (ADR-0341)', async () => {
		const { database } = await start()

		const created = await MemoryNote.createOne({
			data: { rank: 1, title: 'first' },
		})
		const selected = await MemoryNote.createOne({
			data: { rank: 2, title: 'second' },
			select: { title: true },
		})

		expect(Object.keys(created)).toStrictEqual(['id'])
		expect(Object.keys(selected).sort()).toStrictEqual(['id', 'title'])
		expect(selected.title).toBe('second')
		expect(database.rows('MemoryDatabaseNote')).toHaveLength(2)
		expect(database.commits).toBe(2)
	})

	it('reads, filters, orders, paginates and projects stored rows', async () => {
		await start(new MemoryTestDatabase(filtering))
		await MemoryNote.createMany({
			data: [
				{ rank: 3, title: 'c' },
				{ rank: 1, title: 'a' },
				{ rank: 2, title: 'b' },
			],
		})

		const page = await MemoryNote.findMany({
			orderBy: { rank: 'desc' },
			select: { title: true },
			skip: 1,
			take: 1,
			where: { rank: { gte: 1 } },
		})

		expect(page.map((row) => Object.keys(row).sort())).toStrictEqual([
			['id', 'title'],
		])
		expect(page.map(({ title }) => title)).toStrictEqual(['b'])
		await expect(
			MemoryNote.count({ where: { title: { in: ['a', 'c'] } } }),
		).resolves.toBe(2)
		await expect(
			MemoryNote.exists({ where: { title: { eq: 'z' } } }),
		).resolves.toBe(false)
	})

	it('updates and deletes the targeted row and discards a rolled-back write', async () => {
		const { application, database } = await start(
			new MemoryTestDatabase(filtering),
		)
		const { id } = await MemoryNote.createOne({
			data: { rank: 1, title: 'draft' },
		})

		await expect(
			MemoryNote.updateOne({
				data: { title: 'final' },
				select: { rank: true, title: true },
				where: { id },
			}),
		).resolves.toStrictEqual({ id, rank: 1, title: 'final' })
		await expect(
			application.transaction(async () => {
				await MemoryNote.updateOne({ data: { rank: 9 }, where: { id } })
				throw new Error('abandon the transaction')
			}),
		).rejects.toThrow('abandon the transaction')
		expect(database.rollbacks).toBe(1)
		expect(database.rows('MemoryDatabaseNote')[0]?.rank).toBe(1)
		await expect(
			MemoryNote.deleteOne({ select: { title: true }, where: { id } }),
		).resolves.toStrictEqual({ id, title: 'final' })
		expect(database.rows('MemoryDatabaseNote')).toStrictEqual([])
	})
})
