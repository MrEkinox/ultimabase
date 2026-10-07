import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { officialPluginCatalog } from '../../../apps/website/lib/official-plugins.js'
import { officialPlugins } from './catalog.js'

describe('official plugin selector', () => {
	it('matches shipped plugin workspaces and the public website catalog', () => {
		// This is repository-only conformance; the publishable CLI imports its own snapshot.
		const packageDirectory = fileURLToPath(new URL('../../', import.meta.url))
		const shipped = readdirSync(packageDirectory)
			.filter((name) => name.endsWith('-plugin'))
			.sort()
		const listed = officialPlugins.map((plugin) => plugin.id).sort()
		expect(listed).toEqual(shipped)
		expect(listed).toEqual(Object.keys(officialPluginCatalog).sort())
	})
})
