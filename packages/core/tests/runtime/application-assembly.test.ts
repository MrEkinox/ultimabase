import { definePlugin } from '../../src/index.js'
import { Schema } from '../../src/index.js'
import { databaseAdapterServiceToken, UltimaBase } from '../../src/index.js'
import { describe, expect, it } from 'vitest'

import { RecordingDatabaseAdapter } from './fixtures/recording-database-adapter.js'

const publicArticleSchema = Schema.define({
	className: 'PublicAssembledArticle',
	fields: (field) => ({ title: field.string() }),
})

// This integration boundary intentionally imports every framework API publicly.
describe('public application Runtime assembly', () => {
	it('executes a contextual QueryBuilder using only public framework assembly exports', async () => {
		const rows = [
			{
				id: '0198a43e-2431-7000-8000-000000000001',
				title: 'Public assembly',
				createdAt: '2026-08-01T08:00:00.000Z',
				updatedAt: '2026-08-01T08:00:00.000Z',
			},
		]
		const adapter = new RecordingDatabaseAdapter(
			[{ status: 'fulfilled', value: rows }],
			[],
		)
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.public-assembled-database',
			slot: 'database-adapter',
			setup: ({ services }) => {
				services.provide(databaseAdapterServiceToken, adapter)
			},
		})
		const ultimabase = new UltimaBase({
			schemas: [publicArticleSchema],
			plugins: [plugin],
		})
		await ultimabase.start()

		const result = await publicArticleSchema.findMany(undefined, { ultimabase })

		expect(result).toHaveLength(1)
		expect(result[0]).toBeInstanceOf(publicArticleSchema)
		expect(result.map((article) => article.toJSON())).toStrictEqual(rows)
		expect(adapter.rootRequests[0]?.constraints).toStrictEqual([])

		await ultimabase.dispose()
	})
})
