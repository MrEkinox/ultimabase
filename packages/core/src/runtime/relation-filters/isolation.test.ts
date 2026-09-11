import {
	createApplication,
	definePlugin,
	Schema,
	type RelationWhereResolver,
} from '../../index.js'
import { describe, expect, it } from 'vitest'

import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { readApplicationPluginOwner } from '../../plugins/callback-execution.js'
import { materializeSchemaModel } from '../../schema/schema/model.js'
import { createFrameworkEngine } from '../application/create-framework-engine.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import { requestSources } from '../context/request-context.js'

const sourceId = '0198f090-2a50-7000-8000-000000000094'

const databasePlugin = (pluginId: string, adapter: RecordingDatabaseAdapter) =>
	definePlugin({
		capabilities: {
			provides: [provideTestDatabaseAdapter(adapter)],
		},
		core: '^0.0.0',
		pluginId,
		version: '0.0.0',
	})

describe('Runtime relation filter isolation', () => {
	it('rejects a foreign context before invoking a shared schema declaration', async () => {
		let invocations = 0
		const Target = Schema.define({
			className: 'IsolatedRuntimeRelationTarget',
			fields: (field) => ({ visible: field.boolean() }),
		})
		const Source = Schema.define({
			className: 'IsolatedRuntimeRelationSource',
			fields: (field) => ({
				targets: field.relation({
					target: 'IsolatedRuntimeRelationTarget',
					where: (({ where }) => {
						invocations += 1
						return where.eq('visible', true)
					}) as RelationWhereResolver<typeof Target>,
				}),
			}),
		})
		const firstAdapter = new RecordingDatabaseAdapter([], [])
		const secondAdapter = new RecordingDatabaseAdapter([], [])
		const first = await createApplication({
			plugins: [
				databasePlugin('fixture.relation-isolation-first', firstAdapter),
			],
			schemas: [Source, Target],
		})
		const second = await createApplication({
			plugins: [
				databasePlugin('fixture.relation-isolation-second', secondAdapter),
			],
			schemas: [Source, Target],
		})
		const firstRequest = createFrameworkEngine(first).anonymous({
			requestId: 'relation-isolation-first',
			source: requestSources.internal,
		})
		const secondRequest = createFrameworkEngine(second).anonymous({
			requestId: 'relation-isolation-second',
			source: requestSources.internal,
		})
		const relation = materializeSchemaModel(Source, { id: sourceId }).relation(
			'targets',
		)

		try {
			await expect(
				runWithRequestEngine(firstRequest, () =>
					relation.count({}, { context: secondRequest.context }),
				),
			).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
			expect(invocations).toBe(0)
			expect(firstAdapter.rootRequests).toStrictEqual([])
			expect(secondAdapter.rootRequests).toStrictEqual([])
		} finally {
			await Promise.all([first.dispose(), second.dispose()])
		}
	})

	it('attributes application callbacks and observes cancellation after invocation', async () => {
		const controller = new AbortController()
		let owner: unknown = 'not-invoked'
		const Target = Schema.define({
			className: 'CancelledRuntimeRelationTarget',
			fields: (field) => ({ visible: field.boolean() }),
		})
		const Source = Schema.define({
			className: 'CancelledRuntimeRelationSource',
			fields: (field) => ({
				targets: field.relation({
					target: 'CancelledRuntimeRelationTarget',
					where: (({ where }) => {
						owner = readApplicationPluginOwner(application)
						controller.abort()
						return where.eq('visible', true)
					}) as RelationWhereResolver<typeof Target>,
				}),
			}),
		})
		const adapter = new RecordingDatabaseAdapter([], [])
		const application = await createApplication({
			plugins: [databasePlugin('fixture.relation-cancellation', adapter)],
			schemas: [Source, Target],
		})
		const request = createFrameworkEngine(application).anonymous({
			requestId: 'relation-cancellation',
			signal: controller.signal,
			source: requestSources.internal,
		})

		try {
			await expect(
				runWithRequestEngine(request, () =>
					materializeSchemaModel(Source, { id: sourceId })
						.relation('targets')
						.count(),
				),
			).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
			expect(owner).toBeUndefined()
			expect(adapter.rootRequests).toStrictEqual([])
		} finally {
			await application.dispose()
		}
	})
})
