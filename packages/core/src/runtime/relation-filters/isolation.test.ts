import { applicationFixture } from '../../../tests/application-fixture.js'
import { plugin } from '../../plugin.js'
import { createApplication } from '../../application/framework-application.js'
import { describe, expect, it } from 'vitest'

import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { readApplicationPluginOwner } from '../../plugins/callback-execution.js'
import { createFrameworkEngine } from '../application/create-framework-engine.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import { requestSources } from '../context/request-context.js'
import { UltimaBase } from '../application/ultima-base.js'

const databasePlugin = (pluginId: string, adapter: RecordingDatabaseAdapter) =>
	plugin({
		contributions: [provideTestDatabaseAdapter(adapter)],
		core: '^0.0.0',
		id: pluginId,
		version: '0.0.0',
	})

describe('Runtime relation filter isolation', () => {
	it('rejects a foreign context before invoking a shared schema declaration', async () => {
		let invocations = 0
		const Target = UltimaBase.Schema.define({
			className: 'IsolatedRuntimeRelationTarget',
			fields: (field) => ({ visible: field.boolean() }),
		})
		const Source = UltimaBase.Schema.define({
			className: 'IsolatedRuntimeRelationSource',
			fields: (field) => ({
				targets: field.relation({ target: 'IsolatedRuntimeRelationTarget' }),
			}),
		}).with({
			relations: {
				targets: {
					where: ({ where }) => {
						invocations += 1
						return where.eq('visible', true)
					},
				},
			},
		})
		const firstAdapter = new RecordingDatabaseAdapter([], [])
		const secondAdapter = new RecordingDatabaseAdapter([], [])
		const first = applicationFixture(
			await createApplication({
				plugins: [
					databasePlugin('fixture.relation-isolation-first', firstAdapter),
				],
				schemas: [Source, Target],
			}),
		)

		const firstRequest = createFrameworkEngine(first).anonymous({
			requestId: 'relation-isolation-first',
			source: requestSources.internal,
		})
		await first.dispose()
		const second = applicationFixture(
			await createApplication({
				plugins: [
					databasePlugin('fixture.relation-isolation-second', secondAdapter),
				],
				schemas: [Source, Target],
			}),
		)
		const secondRequest = createFrameworkEngine(second).anonymous({
			requestId: 'relation-isolation-second',
			source: requestSources.internal,
		})
		try {
			await expect(
				runWithRequestEngine(secondRequest, () =>
					Source.findMany({ include: { targets: {} } } as never, {
						context: firstRequest.context,
					}),
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
		const Target = UltimaBase.Schema.define({
			className: 'CancelledRuntimeRelationTarget',
			fields: (field) => ({ visible: field.boolean() }),
		})
		const Source = UltimaBase.Schema.define({
			className: 'CancelledRuntimeRelationSource',
			fields: (field) => ({
				targets: field.relation({ target: 'CancelledRuntimeRelationTarget' }),
			}),
		}).with({
			relations: {
				targets: {
					where: ({ where }) => {
						owner = readApplicationPluginOwner(application)
						controller.abort()
						return where.eq('visible', true)
					},
				},
			},
		})
		const adapter = new RecordingDatabaseAdapter([], [])
		const application = applicationFixture(
			await createApplication({
				plugins: [databasePlugin('fixture.relation-cancellation', adapter)],
				schemas: [Source, Target],
			}),
		)
		const request = createFrameworkEngine(application).anonymous({
			requestId: 'relation-cancellation',
			signal: controller.signal,
			source: requestSources.internal,
		})

		try {
			await expect(
				runWithRequestEngine(request, () =>
					Source.findMany({ include: { targets: {} } } as never),
				),
			).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
			expect(owner).toBeUndefined()
			expect(adapter.rootRequests).toStrictEqual([])
		} finally {
			await application.dispose()
		}
	})
})
