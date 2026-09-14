import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
	documentationSections,
	visibleDocumentationSections,
} from '../lib/docs-navigation'
import { resolveDocumentationPage } from '../lib/docs-localization'
import { supportedLocales, type SiteLocale } from '../lib/i18n'

const contentRoot = fileURLToPath(new URL('../content/docs', import.meta.url))
const fixtureRoot = fileURLToPath(new URL('./fixtures', import.meta.url))

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
			href?.startsWith('/fr/docs') === true
			? [href]
			: []
	})
}

function compiledFixtureBlocks(
	source: string,
): readonly { readonly code: string; readonly fixture: string }[] {
	return [
		...source.matchAll(
			/```ts[^\n]*fixture="(?<fixture>[^"]+)"\n(?<code>[\s\S]*?)```/gu,
		),
	].flatMap((match) => {
		const code = match.groups?.code
		const fixture = match.groups?.fixture
		return code === undefined || fixture === undefined
			? []
			: [{ code: code.trim(), fixture }]
	})
}

describe('public documentation content contract', () => {
	it('uses an explicit English source when French is not published', () => {
		expect(resolveDocumentationPage('fr', undefined, '/docs/querying')).toEqual(
			{
				englishPage: '/docs/querying',
				kind: 'translation-fallback',
			},
		)
		expect(resolveDocumentationPage('en', undefined, undefined)).toEqual({
			kind: 'not-found',
		})
		expect(resolveDocumentationPage('fr', '/fr/docs', '/docs')).toEqual({
			kind: 'page',
			page: '/fr/docs',
		})
	})

	it('keeps canonical URLs, metadata, and locales unambiguous', async () => {
		const pages = await readContentPages()
		const urls = pages.map((page) => page.url)

		expect(new Set(urls).size).toBe(urls.length)
		expect([...new Set(pages.map(({ locale }) => locale))].sort()).toEqual(
			[...supportedLocales].sort(),
		)
		expect(urls.sort()).toEqual([
			'/docs',
			'/docs/data-modeling/defaults',
			'/docs/data-modeling/embedded-objects',
			'/docs/data-modeling/fields',
			'/docs/data-modeling/models',
			'/docs/data-modeling/pointers',
			'/docs/data-modeling/relations',
			'/docs/data-modeling/schemas',
			'/docs/getting-started/first-application',
			'/docs/getting-started/installation',
			'/docs/getting-started/introduction',
			'/docs/getting-started/next-steps',
			'/docs/getting-started/project-structure',
			'/fr/docs',
		])

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
			'data-modeling',
		])
		expect(
			visibleDocumentationSections([
				'/docs/plugins/overview',
				'/docs/getting-started/introduction',
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

	it('resolves every absolute internal documentation link', async () => {
		const pages = await readContentPages()
		const publishedUrls = new Set(pages.map((page) => page.url))

		for (const page of pages) {
			for (const href of internalDocumentationLinks(page.source)) {
				expect(publishedUrls.has(href), `${page.filePath} -> ${href}`).toBe(
					true,
				)
			}
		}
	})

	it('renders compiled TypeScript fixtures without documentation drift', async () => {
		const pages = await readContentPages()
		const fixtureBlocks = pages.flatMap((page) =>
			compiledFixtureBlocks(page.source),
		)
		expect(fixtureBlocks.map(({ fixture }) => fixture).sort()).toEqual([
			'data-modeling/defaults.ts',
			'data-modeling/embedded-objects.ts',
			'data-modeling/fields.ts',
			'data-modeling/models.ts',
			'data-modeling/pointers.ts',
			'data-modeling/relationships.ts',
			'data-modeling/schemas.ts',
			'getting-started/main.ts',
			'getting-started/schema.ts',
			'getting-started/ultimabase.ts',
		])

		for (const block of fixtureBlocks) {
			const fixture = await readFile(
				path.join(fixtureRoot, block.fixture),
				'utf8',
			)
			expect(block.code, block.fixture).toBe(fixture.trim())
		}
	})
})
