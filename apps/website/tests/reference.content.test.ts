import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const contentRoot = fileURLToPath(
	new URL('../content/docs/1.0.0/', import.meta.url),
)
const pages = [
	'core/application',
	'core/reading-data/overview',
	'core/runtime/api-errors',
] as const

const readPage = (page: (typeof pages)[number]): Promise<string> =>
	readFile(path.join(contentRoot, `${page}.mdx`), 'utf8')

describe('curated public reference', () => {
	it('combines package lookup and compatibility without promising publication', async () => {
		const page = await readFile(
			path.join(contentRoot, 'reference/package-index.mdx'),
			'utf8',
		)
		expect(page).toContain('title: Packages and Compatibility')
		expect(page).toContain('Node.js 24 or newer')
		expect(page).toContain('one fixed version group')
		expect(page).toContain('versioned independently')
		expect(page).toContain('does **not** prove that an npm package')
		for (const manager of ['npm', 'yarn', 'pnpm']) {
			expect(page).toContain(`tab="${manager}"`)
		}
	})

	it('keeps useful Core lookup within the canonical learning pages', async () => {
		const [application, query, errors] = await Promise.all(pages.map(readPage))
		expect(application).toContain('## Configure the application')
		expect(application).toContain('`pluginPrivileges`')
		expect(query).toContain('## Read terminals')
		expect(query).toContain('## Read failures')
		expect(errors).toContain('## FrameworkError')
		expect(errors).toContain('`frameworkErrorCodes`')
		for (const source of [application, query, errors]) {
			expect(source).toContain('releaseStatus: pre-release')
		}
	})

	it('derives the complete package inventory from public root exports', async () => {
		const packagesRoot = path.join(repositoryRoot, 'packages')
		const directories = await readdir(packagesRoot, { withFileTypes: true })
		const packageNames: string[] = []
		for (const directory of directories) {
			if (!directory.isDirectory()) continue
			const packageSource = await readFile(
				path.join(packagesRoot, directory.name, 'package.json'),
				'utf8',
			).catch(() => undefined)
			if (packageSource === undefined) continue
			const packageJson: unknown = JSON.parse(packageSource)
			if (
				typeof packageJson !== 'object' ||
				packageJson === null ||
				!('name' in packageJson) ||
				typeof packageJson.name !== 'string' ||
				!('exports' in packageJson) ||
				typeof packageJson.exports !== 'object' ||
				packageJson.exports === null
			) {
				throw new TypeError(`${directory.name} has no public package contract`)
			}
			expect(Object.keys(packageJson.exports)).toEqual(['.'])
			packageNames.push(packageJson.name)
		}

		const packagePage = await readFile(
			path.join(contentRoot, 'reference/package-index.mdx'),
			'utf8',
		)
		const documentedNames = [
			...packagePage.matchAll(/`(@ultimabase\/[a-z0-9-]+)`/gu),
		].map((match) => match[1])
		expect([...new Set(documentedNames)].sort()).toEqual(packageNames.sort())
	})

	it('keeps code imports on real package roots without deep paths', async () => {
		const packagePage = await readFile(
			path.join(contentRoot, 'reference/package-index.mdx'),
			'utf8',
		)
		const packageNames = new Set(
			[...packagePage.matchAll(/`(@ultimabase\/[a-z0-9-]+)`/gu)].map(
				(match) => match[1],
			),
		)
		const documentation = (
			await Promise.all(pages.map((page) => readPage(page)))
		).join('\n')
		for (const match of documentation.matchAll(
			/from\s+['"](@ultimabase\/[^'"]+)['"]/gu,
		)) {
			expect(packageNames.has(match[1] ?? ''), match[1]).toBe(true)
		}
	})
})
