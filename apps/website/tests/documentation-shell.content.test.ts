import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
	documentationSections,
	visibleDocumentationSections,
} from '../lib/docs-navigation'
import { resolveDocumentationPage } from '../lib/docs-localization'
import {
	currentDocumentationVersion,
	documentationPath,
	documentationVersions,
	versionDocumentationSlug,
} from '../lib/docs-versions'
import { supportedLocales, type SiteLocale } from '../lib/i18n'

const contentRoot = fileURLToPath(new URL('../content/docs', import.meta.url))

interface ContentPage {
	readonly filePath: string
	readonly locale: SiteLocale
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

function pageUrl(filePath: string): { locale: SiteLocale; url: string } {
	const relativePath = path.relative(contentRoot, filePath)
	const [locale, ...segmentsWithFile] = relativePath.split(path.sep)
	if (locale !== 'en' && locale !== 'fr') {
		throw new TypeError(`Unsupported documentation locale in ${relativePath}`)
	}

	const segments = segmentsWithFile
		.join('/')
		.replace(/\.mdx?$/u, '')
		.split('/')
		.filter((segment) => segment !== 'index')
	const localePrefix = locale === 'en' ? '' : `/${locale}`
	return {
		locale,
		url: `${localePrefix}/docs${segments.length === 0 ? '' : `/${segments.join('/')}`}`,
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
			href?.startsWith('/fr/docs') === true ||
			href?.startsWith('./') === true ||
			href?.startsWith('../') === true
			? [href]
			: []
	})
}

describe('public documentation content contract', () => {
	it('uses an explicit English source when French is not published', () => {
		expect(
			resolveDocumentationPage(
				'fr',
				undefined,
				'/docs/1.0/core/reading-data/overview',
			),
		).toEqual({
			englishPage: '/docs/1.0/core/reading-data/overview',
			kind: 'translation-fallback',
		})
		expect(resolveDocumentationPage('en', undefined, undefined)).toEqual({
			kind: 'not-found',
		})
		expect(resolveDocumentationPage('fr', '/fr/docs/1.0', '/docs/1.0')).toEqual(
			{
				kind: 'page',
				page: '/fr/docs/1.0',
			},
		)
	})

	it('keeps version configuration explicit and maps legacy routes to current docs', async () => {
		expect(documentationVersions).toEqual([{ label: '1.0', slug: '1.0' }])
		expect(currentDocumentationVersion.slug).toBe('1.0')
		expect(documentationPath('en', 'core/reading-data/overview')).toBe(
			'/docs/1.0/core/reading-data/overview',
		)
		expect(documentationPath('fr')).toBe('/fr/docs/1.0')
		expect(versionDocumentationSlug(['querying', 'overview'])).toEqual([
			'1.0',
			'core',
			'reading-data',
			'overview',
		])
		expect(versionDocumentationSlug(['1.0', 'querying', 'overview'])).toEqual([
			'1.0',
			'core',
			'reading-data',
			'overview',
		])
		expect(
			versionDocumentationSlug(['1.0', 'mutations', 'soft-delete']),
		).toEqual([
			'1.0',
			'plugins',
			'official',
			'data-and-persistence',
			'soft-delete',
		])
		expect(versionDocumentationSlug(['1.0', 'security', 'access'])).toEqual([
			'1.0',
			'plugins',
			'official',
			'authentication-and-authorization',
			'access',
		])
		expect(versionDocumentationSlug(['1.0', 'apis', 'rest'])).toEqual([
			'1.0',
			'plugins',
			'official',
			'http-and-apis',
			'rest',
		])

		for (const locale of supportedLocales) {
			const metadata = JSON.parse(
				await readFile(
					path.join(contentRoot, locale, '1.0', 'meta.json'),
					'utf8',
				),
			) as unknown
			expect(metadata).toMatchObject({ root: 'version', title: '1.0' })
		}
	})

	it('keeps canonical URLs, metadata, and locales unambiguous', async () => {
		const pages = await readContentPages()
		const urls = pages.map((page) => page.url)

		expect(new Set(urls).size).toBe(urls.length)
		expect([...new Set(pages.map(({ locale }) => locale))].sort()).toEqual(
			[...supportedLocales].sort(),
		)
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
				'/fr/docs/1.0',
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
				'/docs/1.0/getting-started/introduction',
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
				const resolvesDirectly = publishedUrls.has(resolved)
				const resolvesThroughFrenchFallback =
					resolved.startsWith('/fr/docs') &&
					publishedUrls.has(resolved.slice(3))
				expect(
					resolvesDirectly || resolvesThroughFrenchFallback,
					`${page.filePath} -> ${href}`,
				).toBe(true)
			}
		}
	})
})
