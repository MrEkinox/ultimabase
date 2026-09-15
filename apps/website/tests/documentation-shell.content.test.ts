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
			'/docs/apis/errors',
			'/docs/apis/graphql',
			'/docs/apis/graphql-yoga',
			'/docs/apis/http-applications',
			'/docs/apis/rest',
			'/docs/apis/typescript',
			'/docs/concepts/application-graph',
			'/docs/concepts/architecture-decisions',
			'/docs/concepts/immutability',
			'/docs/concepts/logical-operations-and-persistence',
			'/docs/concepts/request-context',
			'/docs/concepts/runtime-pipeline',
			'/docs/concepts/transactions',
			'/docs/concepts/typegen',
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
			'/docs/guides/add-soft-delete',
			'/docs/guides/add-virtual-fields',
			'/docs/guides/build-an-authenticated-api',
			'/docs/guides/filter-contextual-relations',
			'/docs/guides/run-lifecycle-hooks',
			'/docs/guides/test-an-application',
			'/docs/guides/validate-input',
			'/docs/guides/write-nested-data',
			'/docs/mutations/bulk-operations',
			'/docs/mutations/create',
			'/docs/mutations/delete',
			'/docs/mutations/nested-writes',
			'/docs/mutations/soft-delete',
			'/docs/mutations/transactions',
			'/docs/mutations/update',
			'/docs/mutations/upserts',
			'/docs/operations/application-lifecycle',
			'/docs/operations/browser-policy',
			'/docs/operations/configuration-and-environment',
			'/docs/operations/postgres',
			'/docs/operations/production-checklist',
			'/docs/operations/secrets-and-master-key',
			'/docs/plugins/authoring',
			'/docs/plugins/capabilities',
			'/docs/plugins/identity-and-instances',
			'/docs/plugins/installation',
			'/docs/plugins/lifecycle-and-dependencies',
			'/docs/plugins/manifests-and-privileges',
			'/docs/plugins/official-plugins',
			'/docs/plugins/overview',
			'/docs/querying/contextual-relations',
			'/docs/querying/filters',
			'/docs/querying/includes',
			'/docs/querying/ordering-and-pagination',
			'/docs/querying/overview',
			'/docs/querying/relation-predicates',
			'/docs/querying/selections',
			'/docs/reference/application-configuration',
			'/docs/reference/errors',
			'/docs/reference/fields',
			'/docs/reference/models',
			'/docs/reference/official-plugin-options',
			'/docs/reference/packages',
			'/docs/reference/plugin-manifests',
			'/docs/reference/query',
			'/docs/reference/schema',
			'/docs/security/access',
			'/docs/security/acl',
			'/docs/security/master-authority',
			'/docs/security/overview',
			'/docs/security/password-authentication',
			'/docs/security/request-identity',
			'/docs/security/roles',
			'/docs/troubleshooting/http-and-application-identity',
			'/docs/troubleshooting/postgres',
			'/docs/troubleshooting/reporting-a-problem',
			'/docs/troubleshooting/startup',
			'/docs/troubleshooting/typegen',
			'/fr/docs',
			'/fr/docs/getting-started/first-application',
			'/fr/docs/getting-started/installation',
			'/fr/docs/getting-started/introduction',
			'/fr/docs/getting-started/project-structure',
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
})
