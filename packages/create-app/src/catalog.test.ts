import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { officialPluginCatalog } from '../../../apps/website/lib/official-plugins.js'
import { officialPlugins, withheldPlugins } from './catalog.js'

describe('official plugin selector', () => {
	it('offers or explicitly withholds every shipped plugin workspace and website catalog entry', () => {
		// This is repository-only conformance; the publishable CLI imports its own snapshot.
		const packageDirectory = fileURLToPath(new URL('../../', import.meta.url))
		const shipped = readdirSync(packageDirectory)
			.filter((name) => name.endsWith('-plugin'))
			.sort()
		const offered = officialPlugins.map((plugin) => plugin.id)
		const withheld = [...withheldPlugins.keys()]
		expect(offered.filter((id) => withheld.includes(id))).toEqual([])
		const listed = [...offered, ...withheld].sort()
		expect(listed).toEqual(shipped)
		expect(listed).toEqual(Object.keys(officialPluginCatalog).sort())
	})
})
