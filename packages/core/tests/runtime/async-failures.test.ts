import { describe, expect, it } from 'vitest'

import { UltimaBase } from '../../src/index.js'
import { anonymous, plugin as createPlugin } from '../../src/plugin.js'
import { applicationFixture } from '../application-fixture.js'
import { provideTestDatabaseAdapter } from './fixtures/database-adapter-capability.js'
import { RecordingDatabaseAdapter } from './fixtures/recording-database-adapter.js'

const Article = UltimaBase.Schema.define({
	className: 'AsyncFailureArticle',
	fields: (field) => ({
		slug: field.string({ indexed: 'unique', required: true }),
		title: field.string(),
	}),
})

const createApplication = () =>
	applicationFixture(
		new (UltimaBase.use(
			createPlugin({
				core: '^0.0.0',
				id: 'fixture.async-failures',
				version: '0.0.0',
				contributions: [
					provideTestDatabaseAdapter(new RecordingDatabaseAdapter([], [])),
				],
			}),
		))({ schemas: [Article] }),
	)

/**
 * Calls one asynchronous entry point: it must return its promise without
 * throwing, and report the failure through that promise.
 */
const rejectionOf = (call: () => Promise<unknown>): Promise<unknown> => {
	let returned: Promise<unknown> | undefined
	expect(() => {
		returned = call()
	}).not.toThrow()
	expect(returned).toBeInstanceOf(Promise)
	return returned ?? Promise.resolve()
}

const invalidUuid = new TypeError('where.id must be a valid UUID')
const lookaround = { source: '(?=a)a', flags: [] } as const

describe('asynchronous operations report failures through their promise', () => {
	it('rejects reads whose input cannot build a query', async () => {
		await createApplication().start()
		const where = { id: 'not-a-uuid' }

		await expect(
			rejectionOf(() => Article.findMany({ where })),
		).rejects.toThrow(invalidUuid)
		await expect(rejectionOf(() => Article.findOne({ where }))).rejects.toThrow(
			invalidUuid,
		)
		await expect(
			rejectionOf(() => Article.findOneOrThrow({ where })),
		).rejects.toThrow(invalidUuid)
		await expect(rejectionOf(() => Article.count({ where }))).rejects.toThrow(
			invalidUuid,
		)
		await expect(rejectionOf(() => Article.exists({ where }))).rejects.toThrow(
			invalidUuid,
		)
		await expect(
			rejectionOf(() =>
				Article.findMany({ where: { title: { matches: lookaround } } }),
			),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			publicDetails: { field: 'title', operator: 'matches' },
		})
		await expect(
			rejectionOf(() =>
				Article.findMany(undefined, {
					useMasterKey: 'true' as never,
				}),
			),
		).rejects.toThrow(TypeError)
	})

	it('rejects commands whose input is malformed', async () => {
		await createApplication().start()
		const where = { id: 'not-a-uuid' }
		const notArray = 'rows' as never

		await expect(
			rejectionOf(() =>
				Article.createOne({ data: { slug: 'a' }, extra: true } as never),
			),
		).rejects.toThrow(TypeError)
		await expect(
			rejectionOf(() => Article.createMany({ data: notArray })),
		).rejects.toThrow(new TypeError('schema createMany data must be an array'))
		await expect(
			rejectionOf(() => Article.updateOne({ where, data: { title: 'B' } })),
		).rejects.toThrow(invalidUuid)
		await expect(
			rejectionOf(() => Article.updateMany({ data: notArray })),
		).rejects.toThrow(new TypeError('schema updateMany data must be an array'))
		await expect(
			rejectionOf(() =>
				Article.upsertOne({
					where,
					create: { slug: 'a' },
					update: { title: 'B' },
				}),
			),
		).rejects.toThrow(invalidUuid)
		await expect(
			rejectionOf(() => Article.upsertMany({ data: notArray })),
		).rejects.toThrow(new TypeError('schema upsertMany data must be an array'))
		await expect(
			rejectionOf(() => Article.deleteOne({ where })),
		).rejects.toThrow(invalidUuid)
		await expect(
			rejectionOf(() => Article.deleteMany({ where: notArray })),
		).rejects.toThrow(new TypeError('schema deleteMany where must be an array'))
	})

	it('rejects operations without a started application', async () => {
		const ultimabase = createApplication()

		await expect(rejectionOf(() => Article.findMany())).rejects.toMatchObject({
			code: 'MISSING_EXECUTION_CONTEXT',
		})
		await expect(
			rejectionOf(() => Article.createOne({ data: { slug: 'a' } })),
		).rejects.toMatchObject({ code: 'MISSING_EXECUTION_CONTEXT' })
		await expect(
			rejectionOf(() => ultimabase.transaction(() => undefined)),
		).rejects.toThrow(TypeError)

		await ultimabase.start()
		await ultimabase.stop()
		await expect(rejectionOf(() => Article.findMany())).rejects.toThrow(
			new TypeError(
				'Framework engine requires its initialized active application; received stopped',
			),
		)
		await expect(rejectionOf(() => ultimabase.start())).rejects.toThrow(
			new TypeError('Cannot start UltimaBase while application is stopped'),
		)
	})

	it('rejects malformed application calls', async () => {
		const ultimabase = createApplication()
		await ultimabase.start()

		await expect(
			rejectionOf(() => ultimabase.transaction('nope' as never)),
		).rejects.toThrow(
			new TypeError('UltimaBase transaction callback must be a function'),
		)
		await expect(
			rejectionOf(() => ultimabase.can({ operation: 'read' } as never)),
		).rejects.toThrow(TypeError)
		await expect(
			rejectionOf(() =>
				anonymous(ultimabase, {
					requestId: 'async-failures',
					source: 'fixture',
				}).transaction(undefined as never),
			),
		).rejects.toThrow(
			new TypeError('Request engine transaction handler must be a function'),
		)
	})

	it('rejects stop and dispose requested inside the application work', async () => {
		const ultimabase = createApplication()
		await ultimabase.start()
		const inside = new TypeError(
			'Stop or dispose the application outside its active request callback',
		)

		await ultimabase.transaction(async () => {
			await expect(rejectionOf(() => ultimabase.stop())).rejects.toThrow(inside)
			await expect(rejectionOf(() => ultimabase.dispose())).rejects.toThrow(
				inside,
			)
		})
		expect(ultimabase.state).toBe('started')
	})
})
