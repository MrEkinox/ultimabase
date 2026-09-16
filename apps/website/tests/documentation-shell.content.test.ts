import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
	documentationSections,
	visibleDocumentationSections,
} from '../lib/docs-navigation'
import {
	currentDocumentationVersion,
	documentationPath,
	documentationVersions,
	isDocumentationVersion,
} from '../lib/docs-versions'

const contentRoot = fileURLToPath(new URL('../content/docs', import.meta.url))

interface ContentPage {
	readonly filePath: string
	readonly source: string
	readonly url: string
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null
}

async function findFiles(
	directory: string,
	fileName: (name: string) => boolean,
): Promise<readonly string[]> {
	const entries = await readdir(directory, { withFileTypes: true })
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const entryPath = path.join(directory, entry.name)
			if (entry.isDirectory()) return findFiles(entryPath, fileName)
			return fileName(entry.name) ? [entryPath] : []
		}),
	)
	return nested.flat()
}

function pageUrl(filePath: string): { url: string } {
	const relativePath = path.relative(contentRoot, filePath)
	const segments = relativePath
		.split(path.sep)
		.join('/')
		.replace(/\.mdx?$/u, '')
		.split('/')
		.filter((segment) => segment !== 'index')
	return {
		url: `/docs${segments.length === 0 ? '' : `/${segments.join('/')}`}`,
	}
}

async function readContentPages(): Promise<readonly ContentPage[]> {
	const filePaths = await findFiles(contentRoot, (name) =>
		/\.mdx?$/u.test(name),
	)
	return Promise.all(
		filePaths.map(async (filePath) => ({
			filePath,
			source: await readFile(filePath, 'utf8'),
			...pageUrl(filePath),
		})),
	)
}

function internalDocumentationLinks(source: string): readonly string[] {
	const links = [
		...source.matchAll(/\[[^\]]*\]\((?<href>[^\s)#]+)(?:#[^)]+)?\)/gu),
		...source.matchAll(/\bhref=["'](?<href>[^"'#]+)(?:#[^"']*)?["']/gu),
	]
	return links.flatMap((match) => {
		const href = match.groups?.href
		return href?.startsWith('/docs') === true ||
			href?.startsWith('./') === true ||
			href?.startsWith('../') === true
			? [href]
			: []
	})
}

describe('public documentation content contract', () => {
	it('keeps version configuration explicit and canonical URLs versioned', async () => {
		expect(documentationVersions).toEqual([{ label: '1.0', slug: '1.0' }])
		expect(currentDocumentationVersion.slug).toBe('1.0')
		expect(documentationPath('core/reading-data/overview')).toBe(
			'/docs/1.0/core/reading-data/overview',
		)
		expect(documentationPath()).toBe('/docs/1.0')

		const metadata = JSON.parse(
			await readFile(path.join(contentRoot, '1.0', 'meta.json'), 'utf8'),
		) as unknown
		expect(metadata).toMatchObject({ root: 'version', title: '1.0' })
	})

	it('keeps only release-line folders at the documentation source root', async () => {
		const entries = await readdir(contentRoot, { withFileTypes: true })
		expect(
			entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
		).toEqual(documentationVersions.map(({ slug }) => slug))
		expect(entries.every((entry) => isDocumentationVersion(entry.name))).toBe(
			true,
		)
	})

	it('keeps canonical URLs and metadata unambiguous', async () => {
		const pages = await readContentPages()
		const urls = pages.map((page) => page.url)

		expect(new Set(urls).size).toBe(urls.length)
		expect(urls).toEqual(
			expect.arrayContaining([
				'/docs/1.0',
				'/docs/1.0/core/application/application-graph',
				'/docs/1.0/core/writing-data/delete',
				'/docs/1.0/plugins/official/data-and-persistence/soft-delete',
				'/docs/1.0/plugins/official/http-and-apis/rest',
				'/docs/1.0/plugins/overview',
				'/docs/1.0/plugins/using-plugins',
				'/docs/1.0/plugins/community-plugins',
				'/docs/1.0/plugins/build-a-plugin',
				'/docs/1.0/operations/application-troubleshooting',
				'/docs/1.0/reference/core-api/application',
			]),
		)
		expect(urls).not.toEqual(
			expect.arrayContaining([
				'/docs/1.0/mutations/soft-delete',
				'/docs/1.0/security/access',
				'/docs/1.0/apis/rest',
				'/docs/1.0/plugins/official',
				'/docs/1.0/plugins/community',
				'/docs/1.0/plugins/build-a-plugin/getting-started',
			]),
		)

		for (const page of pages) {
			expect(page.source).toMatch(/^---\n[\s\S]*?\n---/u)
			expect(page.source).toMatch(/^title: .+$/mu)
			expect(page.source).toMatch(/^description: .+$/mu)
			expect(page.source).toMatch(/^audience:\n(?: {2}- .+\n)+/mu)
			expect(page.source).toMatch(
				/^contentType: (tutorial|guide|concept|troubleshooting|reference)$/mu,
			)
			expect(page.source).toMatch(/^outcome: .+$/mu)
			expect(page.source).toMatch(/^owner: ['"]?\d{4}['"]?$/mu)
			expect(page.source).toMatch(/^releaseStatus: (pre-release|stable)$/mu)
			expect(page.source).toMatch(/^reviewedAt: \d{4}-\d{2}-\d{2}$/mu)
			expect(page.source).toMatch(/^sources:\n(?: {2}- .+\n?)+/mu)
		}
	})

	it('keeps the target sidebar order unique and empty sections hidden', async () => {
		const slugs = documentationSections.map(({ slug }) => slug)
		const labels = documentationSections.map(({ label }) => label)
		expect(new Set(slugs).size).toBe(slugs.length)
		expect(new Set(labels).size).toBe(labels.length)

		const visible = visibleDocumentationSections(
			(await readContentPages()).map((page) => page.url),
		)
		expect(visible.map(({ slug }) => slug)).toEqual([
			'getting-started',
			'core',
			'plugins',
			'guides',
			'operations',
			'reference',
		])
		expect(
			visibleDocumentationSections([
				'/docs/1.0/plugins/overview',
				'/docs/1.0/getting-started/installation',
			]).map(({ slug }) => slug),
		).toEqual(['getting-started', 'plugins'])
	})

	it('rejects duplicate entries in sidebar metadata', async () => {
		const metaFiles = await findFiles(
			contentRoot,
			(name) => name === 'meta.json',
		)
		for (const filePath of metaFiles) {
			const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'))
			expect(isRecord(parsed)).toBe(true)
			if (!isRecord(parsed) || !Array.isArray(parsed.pages)) continue

			const pageNames = parsed.pages.filter(
				(pageName): pageName is string => typeof pageName === 'string',
			)
			expect(new Set(pageNames).size, filePath).toBe(pageNames.length)
		}
	})

	it('resolves every internal documentation link', async () => {
		const pages = await readContentPages()
		const publishedUrls = new Set(pages.map((page) => page.url))

		for (const page of pages) {
			for (const href of internalDocumentationLinks(page.source)) {
				const resolved = href.startsWith('/')
					? href
					: path.posix.normalize(
							path.posix.join(path.posix.dirname(page.url), href),
						)
				expect(publishedUrls.has(resolved), `${page.filePath} -> ${href}`).toBe(
					true,
				)
			}
		}
	})
})
