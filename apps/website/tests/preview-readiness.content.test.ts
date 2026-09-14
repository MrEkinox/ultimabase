import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import robots from '../app/robots'
import { exampleScenarios } from '../components/examples/content'
import { createPublicPageMetadata } from '../lib/metadata'
import {
	createPublicSitemap,
	type DocumentationSitemapPage,
} from '../lib/public-sitemap'
import { siteConfig } from '../lib/site'

const websiteRoot = fileURLToPath(new URL('..', import.meta.url))
const documentationRoot = path.join(websiteRoot, 'content/docs')

async function findMdxFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true })
	const files = await Promise.all(
		entries.map(async (entry) => {
			const entryPath = path.join(directory, entry.name)
			return entry.isDirectory()
				? findMdxFiles(entryPath)
				: entry.name.endsWith('.mdx')
					? [entryPath]
					: []
		}),
	)
	return files.flat()
}

async function documentationPages(): Promise<DocumentationSitemapPage[]> {
	const files = await findMdxFiles(documentationRoot)
	return Promise.all(
		files.map(async (file) => {
			const relativePath = path.relative(documentationRoot, file)
			const [locale = 'en', ...segments] = relativePath.split(path.sep)
			const routeSegments = segments
				.join('/')
				.replace(/\.mdx$/u, '')
				.replace(/(?:^|\/)index$/u, '')
			const contents = await readFile(file, 'utf8')
			const reviewedAt = /^reviewedAt:\s*['"]?([^'"\n]+)['"]?$/mu.exec(
				contents,
			)?.[1]
			if (reviewedAt === undefined) {
				throw new Error(`Missing reviewedAt in ${relativePath}`)
			}
			const prefix = locale === 'fr' ? '/fr/docs' : '/docs'
			return {
				locale,
				reviewedAt,
				url: `${prefix}${routeSegments === '' ? '' : `/${routeSegments}`}`,
			}
		}),
	)
}

describe('website preview readiness', () => {
	it('publishes every canonical reader route without engineering internals', async () => {
		const pages = await documentationPages()
		const entries = createPublicSitemap(
			pages,
			exampleScenarios.map((scenario) => scenario.slug),
		)
		const urls = entries.map(({ url }) => url)
		const documentationUrls = pages.map(
			(page) => new URL(page.url, siteConfig.canonicalUrl).href,
		)
		const scenarioUrls = exampleScenarios.map(
			(scenario) =>
				new URL(`/examples/${scenario.slug}`, siteConfig.canonicalUrl).href,
		)

		expect(new Set(urls).size).toBe(urls.length)
		expect(urls).toEqual(
			expect.arrayContaining([
				siteConfig.canonicalUrl.href,
				new URL('/examples', siteConfig.canonicalUrl).href,
				...scenarioUrls,
				...documentationUrls,
			]),
		)
		expect(urls.some((url) => new URL(url).pathname.startsWith('/en'))).toBe(
			false,
		)
		expect(
			urls.some((url) => new URL(url).pathname.includes('/docs/adr')),
		).toBe(false)
		expect(urls).not.toContain(
			new URL('/fr/examples', siteConfig.canonicalUrl).href,
		)
	})

	it('keeps preview indexing disabled until launch is approved', () => {
		expect(siteConfig.preview.indexable).toBe(false)
		expect(robots()).toEqual({
			host: siteConfig.canonicalUrl.origin,
			rules: { disallow: '/', userAgent: '*' },
			sitemap: new URL('/sitemap.xml', siteConfig.canonicalUrl).href,
		})
	})

	it('aligns canonical, Open Graph, and X metadata without a stale image', () => {
		const metadata = createPublicPageMetadata({
			canonicalPath: '/docs/getting-started/introduction',
			description: 'Understand the framework before building an application.',
			languages: {
				en: '/docs/getting-started/introduction',
				fr: '/fr/docs/getting-started/introduction',
			},
			locale: 'en',
			title: 'Introduction',
		})

		expect(metadata.alternates?.canonical).toEqual(
			new URL('/docs/getting-started/introduction', siteConfig.canonicalUrl),
		)
		expect(metadata.openGraph).toMatchObject({
			locale: 'en_US',
			siteName: siteConfig.name,
			title: 'Introduction',
			type: 'website',
		})
		expect(metadata.openGraph?.images).toBeUndefined()
		expect(metadata.twitter).toMatchObject({
			card: 'summary',
			title: 'Introduction',
		})
		expect(metadata.twitter?.images).toBeUndefined()
	})

	it('documents a provider-neutral private preview handoff', async () => {
		const guide = await readFile(
			`${websiteRoot}/docs/preview-readiness.md`,
			'utf8',
		)
		expect(guide).toContain('explicit hosting decision')
		expect(guide).toContain('NEXT_PUBLIC_SITE_URL')
		expect(guide).toContain('Public indexing remains disabled')
		expect(guide).not.toMatch(/\b(?:Vercel|Netlify|Cloudflare Pages)\b/u)
		expect(guide).not.toContain('https://preview.')
	})
})
