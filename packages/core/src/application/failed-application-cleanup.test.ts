import { expect, it } from 'vitest'

import { plugin as createPlugin } from '../plugins/plugin.js'
import { contributeApplication } from '../plugins/plugin-contributions.js'
import { FrameworkApplication } from './framework-application.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'
import { RecordingDatabaseAdapter } from '../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../tests/runtime/fixtures/database-adapter-capability.js'

// This failure deliberately poisons its isolated test realm; no reset may hide it.
it('retains original and cleanup failures and never releases unproven resources', async () => {
	const startupError = new Error('connect failed')
	const cleanupError = new Error('resource could not close')
	let disposals = 0
	const app = new UltimaBase({
		schemas: [],
		plugins: [
			createPlugin({
				id: 'fixture.failed-cleanup',
				version: '0.0.0',
				core: '^0.0.0',
				contributions: [
					provideTestDatabaseAdapter(new RecordingDatabaseAdapter([], [])),
					contributeApplication((context) => {
						const exports = undefined
						const lifecycleContext = { ...context, pluginExports: exports }
						void lifecycleContext
						return {
							exports,
							connect: () =>
								(() => {
									throw startupError
								})(),
							dispose: () =>
								(() => {
									disposals += 1
									throw cleanupError
								})(),
						}
					}),
				],
			}),
		],
	})
	await expect(app.start()).rejects.toMatchObject({
		errors: [startupError, cleanupError],
	})
	await expect(app.dispose()).rejects.toBe(cleanupError)
	await expect(app.dispose()).rejects.toBe(cleanupError)
	expect(disposals).toBe(1)
	const next = new FrameworkApplication({ schemas: [], plugins: [] })
	await expect(next.initialize()).rejects.toThrow(
		'Another UltimaBase application is active',
	)
	await next.dispose()
	await expect(
		new FrameworkApplication({ schemas: [], plugins: [] }).start(),
	).rejects.toThrow('Another UltimaBase application is active')
})
