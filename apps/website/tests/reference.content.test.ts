import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const contentRoot = fileURLToPath(
	new URL('../content/docs/en/reference/', import.meta.url),
)
const pages = [
	'application-configuration',
	'schema',
	'fields',
	'query',
	'models',
	'plugin-manifests',
	'official-plugin-options',
	'errors',
	'packages',
] as const

const readPage = (page: (typeof pages)[number]): Promise<string> =>
	readFile(path.join(contentRoot, `${page}.mdx`), 'utf8')

describe('curated public reference', () => {
	it('keeps every page usable as a complete pre-release lookup', async () => {
		for (const page of pages) {
			const source = await readPage(page)
			for (const heading of [
				'## Signature',
				'## Parameters',
				'## Defaults',
				'## Returns',
				'## Errors',
				'## Example',
			]) {
				expect(source, `${page}: ${heading}`).toContain(heading)
			}
			expect(source).toContain('releaseStatus: pre-release')
			expect(source).toMatch(/\.\.\/[^)\s]+/u)
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

		const packagePage = await readPage('packages')
		const documentedNames = [
			...packagePage.matchAll(/`(@ultimabase\/[a-z0-9-]+)`/gu),
		].map((match) => match[1])
		expect([...new Set(documentedNames)].sort()).toEqual(packageNames.sort())
	})

	it('keeps code imports on real package roots without deep paths', async () => {
		const packagePage = await readPage('packages')
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
