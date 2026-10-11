import { UltimaBase } from '../../src/index.js'
import { plugin as createPlugin } from '../../src/plugin.js'

import { describe, expect, it } from 'vitest'

import { RecordingDatabaseAdapter } from './fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from './fixtures/database-adapter-capability.js'

const publicArticleSchema = UltimaBase.Schema.define({
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
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.public-assembled-database',
			contributions: [provideTestDatabaseAdapter(adapter)],
		})
		const ultimabase = new (UltimaBase.use(plugin))({
			schemas: [publicArticleSchema],
		})
		await ultimabase.start()

		const result = await publicArticleSchema.findMany(undefined)

		expect(result).toHaveLength(1)
		expect(Object.getPrototypeOf(result[0])).toBe(Object.prototype)
		expect(result).toStrictEqual(rows)

		await ultimabase.dispose()
	})
})
