import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { createCapturingLogger } from '@ultimabase/testing/plugins'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('PostgreSQL safe-sync fixture has not started')
	}

	return fixture
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'safe_sync' })
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

const prefix = '[@ultimabase/postgres-plugin] '

/** A fresh application on the worker pool under `override`. */
const createApplication = () =>
	UltimaBase.use(
		postgresPlugin({ pool: getFixture().pool, schemaPolicy: 'override' }),
	)

const readColumns = async (table: string): Promise<readonly string[]> => {
	const { rows } = await getFixture().pool.query<{
		readonly column_name: string
	}>(
		`SELECT column_name FROM information_schema.columns
		 WHERE table_schema = current_schema() AND table_name = $1
		 ORDER BY ordinal_position`,
		[table],
	)
	return rows.map(({ column_name }) => column_name)
}

/** Starts one application and returns its startup failure, if any. */
const startFailure = async (
	application: Readonly<{
		start(): Promise<unknown>
		dispose(): Promise<void>
	}>,
): Promise<unknown> => {
	try {
		await application.start()
		return undefined
	} catch (error: unknown) {
		return error
	} finally {
		await application.dispose()
	}
}

describe(
	'PostgreSQL safe synchronization (ADR-0320)',
	{ concurrent: false },
	() => {
		it('creates snake_case columns in the .with table and logs each change', async () => {
			const App = createApplication()
			const Article = App.Schema.define({
				className: 'SafeSyncArticle',
				fields: (field) => ({
					publishedAt: field.dateTime(),
					readingMinutes: field.int({ required: true }),
				}),
			}).with((plugins) => plugins.postgres({ table: 'safe_sync_articles' }))
			const logger = createCapturingLogger()
			const application = new App({ logger, schemas: [Article] })

			await application.start()
			try {
				const created = await Article.createOne({
					data: { publishedAt: '2026-10-11T08:00:00.000Z', readingMinutes: 4 },
				})
				await expect(
					Article.findOne({
						where: { readingMinutes: { gte: 4 } },
						orderBy: { publishedAt: 'desc' },
					}),
				).resolves.toMatchObject({ id: created.id, readingMinutes: 4 })
				await expect(readColumns('safe_sync_articles')).resolves.toStrictEqual([
					'published_at',
					'reading_minutes',
					'id',
					'created_at',
					'updated_at',
				])
				expect(logger.messages('info')).toContain(
					`${prefix}schema change applied: create table "safe_sync_articles"`,
				)
			} finally {
				await application.dispose()
			}

			// An unchanged schema applies and logs nothing.
			const again = createCapturingLogger()
			const unchanged = new App({ logger: again, schemas: [Article] })
			await unchanged.start()
			await unchanged.dispose()
			expect(
				again
					.messages()
					.filter((message) => message.includes('schema change applied')),
			).toStrictEqual([])
		})

		it('refuses a forgotten rename, then applies the declared renamedFrom', async () => {
			const Legacy = createApplication()
			const LegacyNote = Legacy.Schema.define({
				className: 'SafeSyncNote',
				fields: (field) => ({ headline: field.string({ required: true }) }),
			}).with((plugins) => plugins.postgres({ table: 'safe_sync_notes' }))
			const legacy = new Legacy({ logger: false, schemas: [LegacyNote] })
			await legacy.start()
			const created = await LegacyNote.createOne({
				data: { headline: 'Kept headline' },
			})
			await legacy.dispose()

			const Forgotten = createApplication()
			const ForgottenNote = Forgotten.Schema.define({
				className: 'SafeSyncNote',
				fields: (field) => ({ title: field.string({ required: true }) }),
			}).with((plugins) => plugins.postgres({ table: 'safe_sync_notes' }))
			const failure = await startFailure(
				new Forgotten({ logger: false, schemas: [ForgottenNote] }),
			)

			expect(failure).toMatchObject({
				code: 'VALIDATION_ERROR',
				message:
					'PostgreSQL schema has 1 required column(s) that no field declares, so every insert would fail: "safe_sync_notes"."headline" (text), which looks renamed to field title: declare postgres: { renamedFrom: \'headline\' } on that field or rename the column outside UltimaBase. Unless a column was renamed, make it optional, give it a default or drop it with a migration outside UltimaBase.',
			})
			// Nothing was applied.
			await expect(readColumns('safe_sync_notes')).resolves.toContain(
				'headline',
			)
			await expect(readColumns('safe_sync_notes')).resolves.not.toContain(
				'title',
			)

			const Renamed = createApplication()
			const Note = Renamed.Schema.define({
				className: 'SafeSyncNote',
				fields: (field) => ({
					title: field.string({
						postgres: { renamedFrom: 'headline' },
						required: true,
					}),
				}),
			}).with((plugins) => plugins.postgres({ table: 'safe_sync_notes' }))
			const logger = createCapturingLogger()
			const renamed = new Renamed({ logger, schemas: [Note] })
			await renamed.start()
			try {
				await expect(
					Note.findOne({ where: { id: { eq: created.id } } }),
				).resolves.toMatchObject({ title: 'Kept headline' })
				expect(logger.messages('info')).toContain(
					`${prefix}schema change applied: rename column "safe_sync_notes"."headline" to "title"`,
				)
			} finally {
				await renamed.dispose()
			}
		})

		it('makes an existing camelCase table visible instead of losing its rows', async () => {
			await getFixture().pool.query(
				`CREATE TABLE safe_sync_legacy_posts (
			   id uuid PRIMARY KEY,
			   "createdAt" timestamp(3) with time zone NOT NULL,
			   "updatedAt" timestamp(3) with time zone NOT NULL,
			   title text
			 )`,
			)
			const App = createApplication()
			const Post = App.Schema.define({
				className: 'SafeSyncLegacyPost',
				fields: (field) => ({ title: field.string() }),
			})
			const failure = await startFailure(
				new App({ logger: false, schemas: [Post] }),
			)

			expect(failure).toMatchObject({ code: 'VALIDATION_ERROR' })
			expect(String(failure)).toContain(
				'PostgreSQL schema has 2 required column(s) that no field declares, so every insert would fail: "safe_sync_legacy_posts"."createdAt" (timestamp(3) with time zone), which looks renamed to field createdAt: declare postgres: { renamedFrom: \'createdAt\' } on that field or rename the column outside UltimaBase; "safe_sync_legacy_posts"."updatedAt" (timestamp(3) with time zone), which looks renamed to field updatedAt',
			)
		})

		it('refuses a type change that may lose data and applies a widening one', async () => {
			const Before = createApplication()
			const BeforeMetric = Before.Schema.define({
				className: 'SafeSyncMetric',
				fields: (field) => ({
					amount: field.decimal({ precision: 10, scale: 2 }),
					ratio: field.float(),
				}),
			}).with((plugins) => plugins.postgres({ table: 'safe_sync_metrics' }))
			const before = new Before({ logger: false, schemas: [BeforeMetric] })
			await before.start()
			await BeforeMetric.createOne({ data: { amount: '12.50', ratio: 0.5 } })
			await before.dispose()

			const Narrowing = createApplication()
			const StringMetric = Narrowing.Schema.define({
				className: 'SafeSyncMetric',
				fields: (field) => ({
					amount: field.decimal({ precision: 10, scale: 2 }),
					ratio: field.string(),
				}),
			}).with((plugins) => plugins.postgres({ table: 'safe_sync_metrics' }))
			const refused = await startFailure(
				new Narrowing({ logger: false, schemas: [StringMetric] }),
			)

			expect(refused).toMatchObject({
				code: 'VALIDATION_ERROR',
				message:
					'PostgreSQL direct synchronization applies only widening type conversions; it refuses 1 change(s): change type of "safe_sync_metrics"."ratio" from double precision to text. Restore the field type, or convert the column with a migration outside UltimaBase.',
			})

			const Widening = createApplication()
			const Metric = Widening.Schema.define({
				className: 'SafeSyncMetric',
				fields: (field) => ({
					amount: field.decimal({ precision: 14, scale: 4 }),
					ratio: field.float(),
				}),
			}).with((plugins) => plugins.postgres({ table: 'safe_sync_metrics' }))
			const logger = createCapturingLogger()
			const widening = new Widening({ logger, schemas: [Metric] })
			await widening.start()
			try {
				await expect(Metric.findOne({})).resolves.toMatchObject({
					amount: '12.5000',
					ratio: 0.5,
				})
				expect(logger.messages('info')).toContain(
					`${prefix}schema change applied: change type of "safe_sync_metrics"."amount" from numeric(10,2) to numeric(14, 4)`,
				)
			} finally {
				await widening.dispose()
			}
		})
	},
)
