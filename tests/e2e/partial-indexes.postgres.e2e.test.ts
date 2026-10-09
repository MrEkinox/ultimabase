import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'

// Partial indexes and application health of ADR-0303 on PostgreSQL. The
// declaring factory installs PostgreSQL for its `postgres` schema option only.
const App = UltimaBase.use(
	softDeletePlugin(),
	postgresPlugin({ url: 'postgres://declaration.invalid/ultimabase' }),
)

const UniqueActiveSlug = App.Schema.define({
	className: 'PartialIndexArticle',
	fields: (field) => ({ slug: field.string({ required: true }) }),
})
	.softDelete()
	.with({
		indexes: [{ fields: ['slug'], unique: true, where: { isDeleted: false } }],
		postgres: { table: 'partial_index_articles' },
	})

// The same table with another predicate, as after a declaration change.
const UniqueActiveLongSlug = App.Schema.define({
	className: 'PartialIndexArticle',
	fields: (field) => ({ slug: field.string({ required: true }) }),
})
	.softDelete()
	.with({
		indexes: [
			{
				fields: ['slug'],
				unique: true,
				where: { isDeleted: false, slug: { gt: 'm' } },
			},
		],
		postgres: { table: 'partial_index_articles' },
	})

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) throw new TypeError('Fixture unavailable')
	return fixture
}

const createApplication = (schema: typeof UniqueActiveSlug) =>
	new (UltimaBase.use(
		softDeletePlugin(),
		postgresPlugin({ pool: getFixture().pool, schemaPolicy: 'override' }),
	))({ pluginPrivileges: { logger: false }, schemas: [schema] })

const readPartialIndexes = async (): Promise<readonly string[]> => {
	const result = await getFixture().pool.query<{ readonly indexdef: string }>(
		`SELECT indexdef FROM pg_indexes
		 WHERE schemaname = current_schema()
		   AND tablename = 'partial_index_articles'
		   AND indexdef LIKE '% WHERE %'`,
	)
	return result.rows.map(({ indexdef }) => indexdef)
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'partial_indexes' })
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

describe(
	'partial indexes and health on PostgreSQL (ADR-0303)',
	{ concurrent: false },
	() => {
		it('enforces uniqueness only among the rows the predicate matches', async () => {
			const ultimabase = createApplication(UniqueActiveSlug)
			await ultimabase.start()
			try {
				const first = await UniqueActiveSlug.createOne({
					data: { slug: 'alpha' },
				})
				await expect(
					UniqueActiveSlug.createOne({ data: { slug: 'alpha' } }),
				).rejects.toMatchObject({
					code: 'UNIQUE_VIOLATION',
					publicDetails: { fields: ['slug'], schema: 'PartialIndexArticle' },
				})

				// A soft-deleted row leaves the index, so the slug is free again.
				await UniqueActiveSlug.deleteOne({ id: first.id })
				await expect(
					UniqueActiveSlug.createOne({ data: { slug: 'alpha' } }),
				).resolves.toMatchObject({ slug: 'alpha' })
				await expect(readPartialIndexes()).resolves.toEqual([
					expect.stringContaining('WHERE ("isDeleted" = false)'),
				])
			} finally {
				await ultimabase.dispose()
			}
		})

		it('replaces an index whose predicate changed', async () => {
			const ultimabase = createApplication(UniqueActiveLongSlug)
			await ultimabase.start()
			try {
				const indexes = await readPartialIndexes()
				expect(indexes).toHaveLength(1)
				expect(indexes[0]).toContain('"isDeleted" = false')
				expect(indexes[0]).toContain("slug > 'm'::text")
				// Rows outside the new predicate may now repeat a slug.
				await UniqueActiveLongSlug.createOne({ data: { slug: 'beta' } })
				await expect(
					UniqueActiveLongSlug.createOne({ data: { slug: 'beta' } }),
				).resolves.toMatchObject({ slug: 'beta' })
			} finally {
				await ultimabase.dispose()
			}
		})

		it('reports OK while started and DEGRADED before start and after stop', async () => {
			// The table now holds duplicates the first predicate would reject.
			const ultimabase = createApplication(UniqueActiveLongSlug)
			try {
				await expect(ultimabase.health()).resolves.toBe('DEGRADED')
				await ultimabase.start()
				await expect(ultimabase.health()).resolves.toBe('OK')
				await ultimabase.stop()
				await expect(ultimabase.health()).resolves.toBe('DEGRADED')
			} finally {
				await ultimabase.dispose()
			}
		})
	},
)
