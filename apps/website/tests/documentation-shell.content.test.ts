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
			href?.startsWith('/fr/docs') === true
			? [href]
			: []
	})
}

describe('public documentation content contract', () => {
	it('uses an explicit English source when French is not published', () => {
		expect(
			resolveDocumentationPage('fr', undefined, '/docs/1.0/querying'),
		).toEqual({
			englishPage: '/docs/1.0/querying',
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
		expect(documentationPath('en', 'querying/overview')).toBe(
			'/docs/1.0/querying/overview',
		)
		expect(documentationPath('fr')).toBe('/fr/docs/1.0')
		expect(versionDocumentationSlug(['querying', 'overview'])).toEqual([
			'1.0',
			'querying',
			'overview',
		])
		expect(versionDocumentationSlug(['1.0', 'querying', 'overview'])).toEqual([
			'1.0',
			'querying',
			'overview',
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
		expect(urls.sort()).toEqual([
			'/docs/1.0',
			'/docs/1.0/apis/errors',
			'/docs/1.0/apis/graphql',
			'/docs/1.0/apis/graphql-yoga',
			'/docs/1.0/apis/http-applications',
			'/docs/1.0/apis/rest',
			'/docs/1.0/apis/typescript',
			'/docs/1.0/concepts/application-graph',
			'/docs/1.0/concepts/architecture-decisions',
			'/docs/1.0/concepts/immutability',
			'/docs/1.0/concepts/logical-operations-and-persistence',
			'/docs/1.0/concepts/request-context',
			'/docs/1.0/concepts/runtime-pipeline',
			'/docs/1.0/concepts/transactions',
			'/docs/1.0/concepts/typegen',
			'/docs/1.0/data-modeling/defaults',
			'/docs/1.0/data-modeling/embedded-objects',
			'/docs/1.0/data-modeling/fields',
			'/docs/1.0/data-modeling/models',
			'/docs/1.0/data-modeling/pointers',
			'/docs/1.0/data-modeling/relations',
			'/docs/1.0/data-modeling/schemas',
			'/docs/1.0/getting-started/first-application',
			'/docs/1.0/getting-started/installation',
			'/docs/1.0/getting-started/introduction',
			'/docs/1.0/getting-started/next-steps',
			'/docs/1.0/getting-started/project-structure',
			'/docs/1.0/guides/add-soft-delete',
			'/docs/1.0/guides/add-virtual-fields',
			'/docs/1.0/guides/build-an-authenticated-api',
			'/docs/1.0/guides/filter-contextual-relations',
			'/docs/1.0/guides/run-lifecycle-hooks',
			'/docs/1.0/guides/test-an-application',
			'/docs/1.0/guides/validate-input',
			'/docs/1.0/guides/write-nested-data',
			'/docs/1.0/mutations/bulk-operations',
			'/docs/1.0/mutations/create',
			'/docs/1.0/mutations/delete',
			'/docs/1.0/mutations/nested-writes',
			'/docs/1.0/mutations/soft-delete',
			'/docs/1.0/mutations/transactions',
			'/docs/1.0/mutations/update',
			'/docs/1.0/mutations/upserts',
			'/docs/1.0/operations/application-lifecycle',
			'/docs/1.0/operations/browser-policy',
			'/docs/1.0/operations/configuration-and-environment',
			'/docs/1.0/operations/postgres',
			'/docs/1.0/operations/production-checklist',
			'/docs/1.0/operations/secrets-and-master-key',
			'/docs/1.0/plugins/authoring',
			'/docs/1.0/plugins/capabilities',
			'/docs/1.0/plugins/identity-and-instances',
			'/docs/1.0/plugins/installation',
			'/docs/1.0/plugins/lifecycle-and-dependencies',
			'/docs/1.0/plugins/manifests-and-privileges',
			'/docs/1.0/plugins/official-plugins',
			'/docs/1.0/plugins/overview',
			'/docs/1.0/querying/contextual-relations',
			'/docs/1.0/querying/filters',
			'/docs/1.0/querying/includes',
			'/docs/1.0/querying/ordering-and-pagination',
			'/docs/1.0/querying/overview',
			'/docs/1.0/querying/relation-predicates',
			'/docs/1.0/querying/selections',
			'/docs/1.0/reference/application-configuration',
			'/docs/1.0/reference/errors',
			'/docs/1.0/reference/fields',
			'/docs/1.0/reference/models',
			'/docs/1.0/reference/official-plugin-options',
			'/docs/1.0/reference/packages',
			'/docs/1.0/reference/plugin-manifests',
			'/docs/1.0/reference/query',
			'/docs/1.0/reference/schema',
			'/docs/1.0/security/access',
			'/docs/1.0/security/acl',
			'/docs/1.0/security/master-authority',
			'/docs/1.0/security/overview',
			'/docs/1.0/security/password-authentication',
			'/docs/1.0/security/request-identity',
			'/docs/1.0/security/roles',
			'/docs/1.0/troubleshooting/http-and-application-identity',
			'/docs/1.0/troubleshooting/postgres',
			'/docs/1.0/troubleshooting/reporting-a-problem',
			'/docs/1.0/troubleshooting/startup',
			'/docs/1.0/troubleshooting/typegen',
			'/fr/docs/1.0',
			'/fr/docs/1.0/getting-started/first-application',
			'/fr/docs/1.0/getting-started/installation',
			'/fr/docs/1.0/getting-started/introduction',
			'/fr/docs/1.0/getting-started/project-structure',
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
			'data-modeling',
			'querying',
			'mutations',
			'security',
			'apis',
			'plugins',
			'operations',
			'guides',
			'concepts',
			'troubleshooting',
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
})
