import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import robots from '../app/robots'
import { statusPageSlugs } from '../components/status/content'
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
			const routeSegments = relativePath
				.split(path.sep)
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
			return {
				reviewedAt,
				url: `/docs${routeSegments === '' ? '' : `/${routeSegments}`}`,
			}
		}),
	)
}

describe('website preview readiness', () => {
	it('publishes every canonical reader route without engineering internals', async () => {
		const pages = await documentationPages()
		const entries = createPublicSitemap(pages, statusPageSlugs)
		const urls = entries.map(({ url }) => url)
		const documentationUrls = pages.map(
			(page) => new URL(page.url, siteConfig.canonicalUrl).href,
		)
		const statusUrls = statusPageSlugs.map(
			(slug) => new URL(`/status/${slug}`, siteConfig.canonicalUrl).href,
		)

		expect(new Set(urls).size).toBe(urls.length)
		expect(urls).toEqual(
			expect.arrayContaining([
				siteConfig.canonicalUrl.href,
				...statusUrls,
				...documentationUrls,
			]),
		)
		expect(
			urls.some((url) => new URL(url).pathname.startsWith('/examples')),
		).toBe(false)
		expect(urls.every((url) => !new URL(url).pathname.startsWith('/fr'))).toBe(
			true,
		)
		expect(
			urls.some((url) => new URL(url).pathname.includes('/docs/1.0/adr')),
		).toBe(false)
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
			canonicalPath: '/docs/1.0/getting-started/introduction',
			description: 'Understand the framework before building an application.',
			title: 'Introduction',
		})

		expect(metadata.alternates?.canonical).toBe(
			new URL('/docs/1.0/getting-started/introduction', siteConfig.canonicalUrl)
				.href,
		)
		expect(metadata.openGraph).toMatchObject({
			locale: 'en_US',
			siteName: siteConfig.name,
			title: 'Introduction',
			type: 'website',
		})
		expect(metadata.openGraph?.images).toBeUndefined()
		expect(metadata.alternates?.languages).toBeUndefined()
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
