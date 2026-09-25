import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { officialPluginCatalog } from '../lib/official-plugins'
import { documentationPlanSchema } from '../lib/docs-content-contract'

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
	it('keeps every plugin page aligned with the plan and real repository sources', async () => {
		const pluginDirectory = path.dirname(pluginPagePath)
		const rawPlan: unknown = JSON.parse(
			await readFile(
				path.join(
					path.dirname(pluginDirectory),
					'../../documentation-plan.json',
				),
				'utf8',
			),
		)
		const plan = documentationPlanSchema.parse(rawPlan)
		const pluginSection = plan.sections.find(({ slug }) => slug === 'plugins')
		if (pluginSection === undefined) throw new Error('Plugins plan is missing')

		for (const page of pluginSection.pages) {
			const relativePath =
				page.slug === 'build-a-plugin'
					? 'build-a-plugin/index.mdx'
					: `${page.slug}.mdx`
			const source = await readFile(
				path.join(pluginDirectory, relativePath),
				'utf8',
			)
			expect(source, page.slug).toContain(`outcome: ${page.outcome}`)
			const sources = /^sources:\n(?<paths>(?: {2}- .+\n)+)/mu.exec(source)
			if (sources?.groups?.paths === undefined) {
				throw new Error(`${page.slug} has no repository sources`)
			}
			for (const [, sourcePath] of sources.groups.paths.matchAll(
				/^ {2}- (.+)$/gmu,
			)) {
				if (sourcePath === undefined) continue
				await expect(
					access(path.join(repositoryRoot, sourcePath)),
					`${page.slug}: ${sourcePath}`,
				).resolves.toBeUndefined()
			}
		}
	})

	it('shows package-manager choices on plugin consumption and authoring pages', async () => {
		for (const pageName of ['using-plugins.mdx', 'build-a-plugin/index.mdx']) {
			const source = await readFile(
				path.join(path.dirname(pluginPagePath), pageName),
				'utf8',
			)
			for (const manager of ['npm', 'yarn', 'pnpm']) {
				expect(source, `${pageName}: ${manager}`).toContain(`tab="${manager}"`)
			}
		}
	})

	it('uses one reader journey on every official plugin page', async () => {
		const directory = path.join(path.dirname(pluginPagePath), 'official')
		const entries = await readdir(directory, { withFileTypes: true })
		const pages = entries.filter(
			(entry) => entry.isFile() && entry.name.endsWith('.mdx'),
		)

		for (const page of pages) {
			const source = await readFile(path.join(directory, page.name), 'utf8')
			const headings = [...source.matchAll(/^## (?<title>.+)$/gmu)].map(
				(match) => match.groups?.title,
			)
			expect(headings, page.name).toEqual([
				'Overview',
				'Installation',
				'Configuration',
				'Behavior and limitations',
				'Troubleshooting',
			])
			for (const manager of ['npm', 'yarn', 'pnpm']) {
				expect(source, `${page.name}: ${manager}`).toContain(`tab="${manager}"`)
			}
		}
	})

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

	it('states explicit installation and keeps Core authoring independent from Plugin Kit', async () => {
		const pages = await Promise.all(
			['overview.mdx', 'using-plugins.mdx', 'build-a-plugin/index.mdx'].map(
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
		expect(documentation).toContain('Plugin Kit is optional.')
		expect(documentation).toContain(
			'identity and configured plugin definitions belong directly to Core.',
		)
		expect(documentation).toContain(
			'no generic registry, service locator,',
		)
		expect(documentation).toContain('privilege shortcut')
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
