import { describe, expect, it } from 'vitest'

import { UltimaBase } from './ultima-base.js'

// ADR-0311: `start()` resolves to the application itself, so
// `await using app = await ultimabase.start()` disposes it at scope end.
describe('UltimaBase start()', () => {
	it('resolves to the same instance and shares concurrent starts', async () => {
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			schemas: [],
		})
		const first = ultimabase.start()

		expect(ultimabase.start()).toBe(first)
		await expect(first).resolves.toBe(ultimabase)
		await ultimabase.dispose()
	})

	it('disposes the started application at the end of an await using scope', async () => {
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			schemas: [],
		})
		{
			await using app = await ultimabase.start()
			expect(app).toBe(ultimabase)
			expect(app.state).toBe('started')
		}
		expect(ultimabase.state).toBe('disposed')
	})
})
