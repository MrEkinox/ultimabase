import { expect, it } from 'vitest'

import { definePlugin } from '../plugins/definition.js'
import { FrameworkApplication } from './framework-application.js'

// A failed stop leaves resource ownership unproven even if later disposal succeeds.
it('retains a stop failure after disposal and refuses to reuse the poisoned realm', async () => {
	const failure = new Error('listener could not stop')
	const trace: string[] = []
	const app = new FrameworkApplication({
		schemas: [],
		plugins: [
			definePlugin({
				pluginId: 'fixture.failed-stop',
				version: '0.0.0',
				core: '^0.0.0',
				hooks: {
					stop: () => {
						trace.push('stop')
						throw failure
					},
					dispose: () => {
						trace.push('dispose')
					},
				},
			}),
		],
	})
	await app.start()
	await expect(app.stop()).rejects.toBe(failure)
	await expect(app.dispose()).rejects.toBe(failure)
	await expect(app.dispose()).rejects.toBe(failure)
	expect(trace).toEqual(['stop', 'dispose'])
	await expect(
		new FrameworkApplication({ schemas: [], plugins: [] }).initialize(),
	).rejects.toThrow('Another UltimaBase application is active')
})
