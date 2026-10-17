import process from 'node:process'

import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import { Article } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { forgottenRename, releaseOne } from './releases.ts'
import { openDedicatedSchema, recordingLogger } from './support.ts'

// One database followed across releases: release 1 creates it, release 2
// (the application in `src/`) renames a column. The tests run in order and
// start each application themselves on a PostgreSQL schema of their own.
let schema: Awaited<ReturnType<typeof openDedicatedSchema>>

beforeAll(async () => {
	schema = await openDedicatedSchema(
		`postgres_example_sync_${String(process.env.VITEST_POOL_ID)}`,
	)
})

afterAll(async () => {
	await schema.drop()
})

it('creates the tables of release 1 under override', async () => {
	const { logger, messages } = recordingLogger()
	const { ultimabase, Article, StaffMember } = releaseOne({
		url: schema.url,
		schemaPolicy: 'override',
		logger,
	})
	await ultimabase.start()

	try {
		expect(messages('info')).toContainEqual(
			expect.stringContaining(
				'schema change applied: create table "newsroom_articles"',
			),
		)
		const author = await StaffMember.createOne({
			data: { name: 'Ada', email: 'ada@example.com' },
		})
		await Article.createOne({
			data: {
				slug: 'launch',
				headline: 'We launch today',
				author: { connect: author.id },
			},
		})
	} finally {
		await ultimabase.dispose()
	}
})

it('refuses a rename without renamedFrom', async () => {
	const { logger } = recordingLogger()
	const ultimabase = forgottenRename({
		url: schema.url,
		schemaPolicy: 'override',
		logger,
	})

	const failure = ultimabase.start()

	await expect(failure).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
	await expect(failure).rejects.toThrow(
		`"newsroom_articles"."headline" (text), which looks renamed to field title: declare postgres: { renamedFrom: 'headline' } on that field`,
	)
	await ultimabase.dispose()
})

it('renames the column of release 2 and keeps its data', async () => {
	const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
	vi.stubEnv('DATABASE_URL', schema.url)
	try {
		await ultimabase.start()
		const article = await Article.findOneOrThrow({ where: { slug: 'launch' } })

		expect(article.title).toBe('We launch today')
		expect(info).toHaveBeenCalledWith(
			expect.stringContaining(
				'schema change applied: rename column "newsroom_articles"."headline" to "title"',
			),
		)
	} finally {
		await ultimabase.dispose()
		vi.unstubAllEnvs()
		info.mockRestore()
	}
})

it('reports drift under fail', async () => {
	// The database of release 2 has no `headline` column, and indexes that
	// release 1 does not declare.
	const { logger } = recordingLogger()
	const { ultimabase } = releaseOne({
		url: schema.url,
		schemaPolicy: 'fail',
		logger,
	})

	const failure = ultimabase.start()

	await expect(failure).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
	await expect(failure).rejects.toThrow(
		'PostgreSQL schema differs from the registered UltimaBase schemas. 3 change(s): add column "newsroom_articles"."headline" (text, required); drop index',
	)
	await ultimabase.dispose()
})

it('skips preparation under ignore', async () => {
	const { logger, messages } = recordingLogger()
	const { ultimabase } = releaseOne({
		url: schema.url,
		schemaPolicy: 'ignore',
		logger,
	})

	await ultimabase.start()
	await ultimabase.dispose()

	expect(messages('info')).not.toContainEqual(
		expect.stringContaining('schema change applied'),
	)
})
