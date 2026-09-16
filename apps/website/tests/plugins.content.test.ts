import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { officialPluginCatalog } from '../lib/official-plugins'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const pluginPagePath = fileURLToPath(
	new URL('../content/docs/1.0.0/plugins/overview.mdx', import.meta.url),
)

async function readMdxTree(directory: string): Promise<string> {
	const entries = await readdir(directory, { withFileTypes: true })
	const sources = await Promise.all(
		entries.map((entry) => {
			const entryPath = path.join(directory, entry.name)
			if (entry.isDirectory()) return readMdxTree(entryPath)
			return entry.name.endsWith('.mdx')
				? readFile(entryPath, 'utf8')
				: Promise.resolve('')
		}),
	)
	return sources.join('\n')
}

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

		const page = await readMdxTree(
			path.join(path.dirname(pluginPagePath), 'official'),
		)
		for (const directory of pluginDirectories) {
			expect(page, directory).toContain(`packages/${directory}/README.md`)
		}
	})

	it('states explicit installation and preserves Plugin Kit boundaries', async () => {
		const pages = await Promise.all(
			['overview.mdx', 'using-plugins.mdx', 'build-a-plugin.mdx'].map(
				(relativePath) =>
					readFile(
						path.join(path.dirname(pluginPagePath), relativePath),
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

	it('keeps official and community ownership visibly separate', async () => {
		const community = await readFile(
			path.join(path.dirname(pluginPagePath), 'community-plugins.mdx'),
			'utf8',
		)
		expect(community).toContain('No community plugin is listed yet.')
		expect(community).toContain('community-maintained')
		expect(community).not.toContain('@ultimabase/community-')
	})
})
