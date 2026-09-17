import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Slugger from 'github-slugger'
import { describe, expect, it } from 'vitest'

import { statusPages } from '../components/status/content'
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
		...source.matchAll(/\[[^\]]*\]\((?<href>[^\s)]+)\)/gu),
		...source.matchAll(/\bhref=["'](?<href>[^"']+)["']/gu),
	]
	return links.flatMap((match) => {
		const href = match.groups?.href
		return href?.startsWith('/docs') === true ||
			href?.startsWith('./') === true ||
			href?.startsWith('../') === true ||
			href?.startsWith('#') === true
			? [href]
			: []
	})
}

function headingAnchors(source: string): ReadonlySet<string> {
	const slugger = new Slugger()
	const anchors = new Set<string>()
	let inCodeBlock = false

	for (const line of source.split('\n')) {
		if (/^(?:```|~~~)/u.test(line)) {
			inCodeBlock = !inCodeBlock
			continue
		}
		if (inCodeBlock) continue

		const title = /^#{1,6} (?<title>.+)$/u.exec(line)?.groups?.title
		if (title === undefined) continue
		const explicitId = /\s*\[#(?<id>[^\]]+)\]\s*$/u.exec(title)?.groups?.id
		anchors.add(`#${explicitId ?? slugger.slug(title)}`)
	}

	return anchors
}

describe('public documentation content contract', () => {
	it('keeps version configuration explicit and canonical URLs versioned', async () => {
		expect(documentationVersions).toEqual([
			{ label: 'Version 1.0.0', slug: '1.0.0' },
		])
		expect(currentDocumentationVersion.slug).toBe('1.0.0')
		expect(documentationPath('core/reading-data/overview')).toBe(
			'/docs/1.0.0/core/reading-data/overview',
		)
		expect(documentationPath()).toBe('/docs/1.0.0')

		const metadata = JSON.parse(
			await readFile(path.join(contentRoot, '1.0.0', 'meta.json'), 'utf8'),
		) as unknown
		expect(metadata).toMatchObject({
			root: 'version',
			title: 'Version 1.0.0',
		})
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
				'/docs/1.0.0',
				'/docs/1.0.0/core/application',
				'/docs/1.0.0/guides/generate-types',
				'/docs/1.0.0/guides/test-an-application',
				'/docs/1.0.0/core/writing-data/delete',
				'/docs/1.0.0/plugins/official/soft-delete',
				'/docs/1.0.0/plugins/official/rest',
				'/docs/1.0.0/plugins/overview',
				'/docs/1.0.0/plugins/using-plugins',
				'/docs/1.0.0/plugins/community-plugins',
				'/docs/1.0.0/plugins/build-a-plugin',
				'/docs/1.0.0/plugins/build-a-plugin/schemas-and-typegen',
				'/docs/1.0.0/plugins/build-a-plugin/operations-and-graphql',
				'/docs/1.0.0/plugins/build-a-plugin/runtime-and-infrastructure',
				'/docs/1.0.0/operations/troubleshooting',
				'/docs/1.0.0/reference/package-index',
			]),
		)
		expect(urls).not.toEqual(
			expect.arrayContaining([
				'/docs/1.0.0/mutations/soft-delete',
				'/docs/1.0.0/security/access',
				'/docs/1.0.0/apis/rest',
				'/docs/1.0.0/plugins/official',
				'/docs/1.0.0/plugins/community',
				'/docs/1.0.0/plugins/build-a-plugin/getting-started',
				'/docs/1.0.0/reference/core-api/application',
				'/docs/1.0.0/guides/write-nested-data',
				'/docs/1.0.0/guides/filter-contextual-relations',
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
			'core',
			'plugins',
			'guides',
			'operations',
			'reference',
		])
		expect(
			visibleDocumentationSections([
				'/docs/1.0.0/plugins/overview',
				'/docs/1.0.0/manual-installation',
			]).map(({ slug }) => slug),
		).toEqual(['plugins'])
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

	it('resolves every internal documentation link and section anchor', async () => {
		const pages = await readContentPages()
		// Fumadocs uses github-slugger for heading IDs; ignore fenced examples.
		const publishedPages = new Map(
			pages.map((page) => [page.url, headingAnchors(page.source)]),
		)
		expect(publishedPages.size).toBe(pages.length)

		const checkLink = (from: string, href: string): void => {
			const [pathname, fragment] = href.split('#', 2)
			const resolved =
				pathname === ''
					? from
					: pathname?.startsWith('/') === true
						? pathname
						: path.posix.normalize(
								path.posix.join(path.posix.dirname(from), pathname ?? ''),
							)
			const headings = publishedPages.get(resolved)
			expect(headings, `${from} -> ${href}`).toBeDefined()
			if (fragment !== undefined && fragment !== '') {
				expect(
					headings?.has(`#${decodeURIComponent(fragment)}`),
					`${from} -> ${href}`,
				).toBe(true)
			}
		}

		for (const page of pages) {
			for (const href of internalDocumentationLinks(page.source)) {
				checkLink(page.url, href)
			}
		}

		for (const page of statusPages) {
			const links = [
				page.primaryAction.href,
				...page.sections.flatMap((section) =>
					section.items.flatMap((item) => item.href ?? []),
				),
			]
			for (const href of links) {
				if (href.startsWith('/docs')) checkLink(`/status/${page.slug}`, href)
			}
		}
	})
})
