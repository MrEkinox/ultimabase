import { UltimaBase, plugin, provideCapability } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { hooksPlugin } from '../plugin.js'
import { hookDiagnosticsObserverCapability } from './diagnostics.js'

describe('hookDiagnosticsObserverCapability', () => {
	it('materializes the selected application observer once', async () => {
		const observer = () => undefined
		let materializations = 0
		const provider = plugin({
			contributions: [
				provideCapability(hookDiagnosticsObserverCapability, {
					contributionId: 'test-observer',
					create: () => {
						materializations += 1
						return { value: observer }
					},
				}),
			],
			core: '^0.0.0',
			id: 'fixture.hooks-diagnostics',
			version: '0.0.0',
		})
		const application = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [provider, hooksPlugin()],
			schemas: [],
		})
		await application.initialize()

		expect(materializations).toBe(1)
		await application.dispose()
	})
})
