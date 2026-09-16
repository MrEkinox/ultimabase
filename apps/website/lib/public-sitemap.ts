import type { MetadataRoute } from 'next'

import { currentDocumentationPath } from './docs-versions'
import { siteConfig } from './site'

export interface DocumentationSitemapPage {
	readonly reviewedAt: string
	readonly url: string
}

const absoluteUrl = (pathname: string): string =>
	new URL(pathname, siteConfig.canonicalUrl).href

/** Builds the public route inventory without exposing repository-internal documents. */
export function createPublicSitemap(
	documentationPages: readonly DocumentationSitemapPage[],
	statusSlugs: readonly string[],
): MetadataRoute.Sitemap {
	const marketing: MetadataRoute.Sitemap = [
		{
			changeFrequency: 'monthly',
			lastModified: siteConfig.preview.reviewedAt,
			priority: 1,
			url: absoluteUrl('/'),
		},
		...statusSlugs.map((slug) => ({
			changeFrequency: 'weekly' as const,
			lastModified: siteConfig.preview.reviewedAt,
			priority: 0.6,
			url: absoluteUrl(`/status/${slug}`),
		})),
	]

	const documentation: MetadataRoute.Sitemap = documentationPages.map(
		(page) => {
			return {
				changeFrequency: 'weekly',
				lastModified: page.reviewedAt,
				priority: page.url === currentDocumentationPath() ? 0.9 : 0.8,
				url: absoluteUrl(page.url),
			}
		},
	)

	return [...marketing, ...documentation]
}
