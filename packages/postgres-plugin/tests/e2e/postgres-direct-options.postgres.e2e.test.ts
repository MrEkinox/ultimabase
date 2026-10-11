import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('PostgreSQL direct-option fixture has not started')
	}

	return fixture
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'direct_options' })
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

it('preserves data while applying a direct field rename to an explicit table', async () => {
	const LegacyApplication = UltimaBase.use(
		postgresPlugin({
			pool: getFixture().pool,
			schemaPolicy: 'override',
		}),
	)
	const LegacyArticle = LegacyApplication.Schema.define({
		className: 'DirectOptionArticle',
		fields: (field) => ({
			headline: field.string({ required: true }),
		}),
	}).with({ postgres: { table: 'direct_option_articles' } })
	const legacy = new LegacyApplication({
		logger: false,
		schemas: [LegacyArticle],
	})
	await legacy.start()
	const created = await LegacyArticle.createOne({
		data: { headline: 'Preserved headline' },
	})
	await legacy.dispose()

	const RenamedApplication = UltimaBase.use(
		postgresPlugin({
			pool: getFixture().pool,
			schemaPolicy: 'override',
		}),
	)
	const Article = RenamedApplication.Schema.define({
		className: 'DirectOptionArticle',
		fields: (field) => ({
			title: field.string({
				postgres: { renamedFrom: 'headline' },
				required: true,
			}),
		}),
	}).with({ postgres: { table: 'direct_option_articles' } })
	const renamed = new RenamedApplication({
		logger: false,
		schemas: [Article],
	})
	await renamed.start()

	try {
		const article = await Article.findOne({ where: { id: { eq: created.id } } })
		const { rows } = await getFixture().pool.query<{
			readonly column_name: string
		}>(
			`SELECT column_name
			 FROM information_schema.columns
			 WHERE table_schema = current_schema()
			   AND table_name = 'direct_option_articles'
			 ORDER BY ordinal_position`,
		)

		expect(article?.title).toBe('Preserved headline')
		expect(rows.map(({ column_name }) => column_name)).toContain('title')
		expect(rows.map(({ column_name }) => column_name)).not.toContain('headline')
	} finally {
		await renamed.dispose()
	}
}, 30_000)
