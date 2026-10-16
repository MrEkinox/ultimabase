import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'

// ADR-0339 on PostgreSQL: a feature key in `define` adds its fields and
// commands, `indexes` name those fields, a complete unique index is a unique
// target and a partial one only enforces uniqueness, and the rules come from
// `.with((plugins) => …)`.
const App = UltimaBase.use(
	softDeletePlugin(),
	postgresPlugin({ url: 'postgres://declaration.invalid/ultimabase' }),
)

const Article = App.Schema.define({
	className: 'DefineWithArticle',
	fields: (field) => ({
		slug: field.string({ required: true }),
		title: field.string({ required: true }),
	}),
	softDelete: { mode: 'command' },
	indexes: [
		{ fields: ['slug', 'isDeleted'], unique: true },
		{ fields: ['title'], unique: true, where: { isDeleted: false } },
	],
}).with((plugins) => plugins.postgres({ table: 'define_with_articles' }))

let fixture: PostgresWorkerFixture | undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'define_with' })
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

describe('define features and .with rules on PostgreSQL (ADR-0339)', () => {
	it('runs a feature, its index fields and the unique targets of define', async () => {
		if (fixture === undefined) throw new TypeError('Fixture unavailable')
		const ultimabase = new (UltimaBase.use(
			softDeletePlugin(),
			postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
		))({ logger: false, schemas: [Article] })
		await ultimabase.start()
		try {
			const first = await Article.createOne({
				data: { slug: 'alpha', title: 'Alpha' },
			})
			// The complete unique index names the feature field `isDeleted`.
			const renamed = await Article.updateOne({
				where: { slug: 'alpha', isDeleted: false },
				data: { title: 'Alpha 2' },
			})
			expect(renamed).toMatchObject({ id: first.id, title: 'Alpha 2' })

			// The partial unique index applies to the rows it matches only.
			await expect(
				Article.createOne({ data: { slug: 'beta', title: 'Alpha 2' } }),
			).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
			await Article.softDeleteOne({ id: first.id })
			const second = await Article.createOne({
				data: { slug: 'alpha', title: 'Alpha 2' },
			})
			expect(second.id).not.toBe(first.id)

			// A partial unique index is not a unique target.
			await expect(
				Article.updateOne({
					where: { title: 'Alpha 2' } as never,
					data: { slug: 'gamma' },
				}),
			).rejects.toThrow(
				'must match id, a unique field or one non-partial unique index of define',
			)
		} finally {
			await ultimabase.dispose()
		}
	}, 60_000)
})
