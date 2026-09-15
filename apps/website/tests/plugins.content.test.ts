import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { officialPluginCatalog } from '../lib/official-plugins'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const pluginPagePath = fileURLToPath(
	new URL(
		'../content/docs/en/1.0/plugins/official-plugins.mdx',
		import.meta.url,
	),
)
describe('plugin documentation contracts', () => {
	it('classifies every current official plugin package deliberately', async () => {
		const packageEntries = await readdir(
			path.join(repositoryRoot, 'packages'),
			{
				withFileTypes: true,
			},
		)
		const pluginDirectories = packageEntries
			.filter((entry) => entry.isDirectory() && entry.name.endsWith('-plugin'))
			.map((entry) => entry.name)
			.sort()

		expect(Object.keys(officialPluginCatalog).sort()).toEqual(pluginDirectories)

		const page = await readFile(pluginPagePath, 'utf8')
		for (const directory of pluginDirectories) {
			expect(page, directory).toContain(`@ultimabase/${directory}`)
		}
	})

	it('states explicit installation and preserves Plugin Kit boundaries', async () => {
		const pages = await Promise.all(
			['overview', 'installation', 'authoring'].map((pageName) =>
				readFile(
					path.join(path.dirname(pluginPagePath), `${pageName}.mdx`),
					'utf8',
				),
			),
		)
		const documentation = pages.join('\n')

		expect(documentation).toContain(
			'Importing a plugin package never installs it.',
		)
		expect(documentation).toContain(
			'not a plugin, registry, service locator, or permission bypass',
		)
	})
})
