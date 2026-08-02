import { createApplication, definePlugin } from '@ultimabase/core'
import { Schema, stringField } from '@ultimabase/schema'
import {
	createFrameworkEngine,
	databaseAdapterServiceToken,
	requestSources,
} from '@ultimabase/runtime'
import { describe, expect, it } from 'vitest'

import { RecordingDatabaseAdapter } from './fixtures/recording-database-adapter.js'

const publicArticleSchema = new Schema({
	className: 'PublicAssembledArticle',
	fields: { title: stringField() },
})

// This integration boundary intentionally imports every framework API publicly.
describe('public application Runtime assembly', () => {
	it('executes a bound Query using only public framework assembly exports', async () => {
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
			name: 'fixture.public-assembled-database',
			slot: 'database-adapter',
			setup: ({ services }) => {
				services.provide(databaseAdapterServiceToken, adapter)
			},
		})
		const application = await createApplication({
			schemas: [publicArticleSchema],
			plugins: [plugin],
		})
		const framework = createFrameworkEngine(application)
		const request = framework.anonymous({
			requestId: 'public-assembly',
			source: requestSources.internal,
		})

		const result = await request.query(publicArticleSchema).find()

		expect(result).toStrictEqual(rows)
		expect(adapter.rootRequests[0]?.accessConstraints).toStrictEqual([])

		await application.dispose()
	})
})
