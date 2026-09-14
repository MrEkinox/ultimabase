import type { MetadataRoute } from 'next'

import { siteConfig } from './site'

export interface DocumentationSitemapPage {
	readonly locale?: string
	readonly reviewedAt: string
	readonly url: string
}

const absoluteUrl = (pathname: string): string =>
	new URL(pathname, siteConfig.canonicalUrl).href

/** Builds the public route inventory without exposing repository-internal documents. */
export function createPublicSitemap(
	documentationPages: readonly DocumentationSitemapPage[],
	scenarioSlugs: readonly string[],
	statusSlugs: readonly string[] = [],
): MetadataRoute.Sitemap {
	const frenchDocumentationPaths = new Set(
		documentationPages
			.filter((page) => page.locale === 'fr')
			.map((page) => page.url.replace(/^\/fr(?=\/docs(?:\/|$))/u, '')),
	)
	const marketing: MetadataRoute.Sitemap = [
		{
			alternates: {
				languages: { en: absoluteUrl('/'), fr: absoluteUrl('/fr') },
			},
			changeFrequency: 'monthly',
			lastModified: siteConfig.preview.reviewedAt,
			priority: 1,
			url: absoluteUrl('/'),
		},
		{
			changeFrequency: 'monthly',
			lastModified: siteConfig.preview.reviewedAt,
			priority: 0.7,
			url: absoluteUrl('/examples'),
		},
		...scenarioSlugs.map((slug) => ({
			changeFrequency: 'monthly' as const,
			lastModified: siteConfig.preview.reviewedAt,
			priority: 0.6,
			url: absoluteUrl(`/examples/${slug}`),
		})),
		...statusSlugs.map((slug) => ({
			changeFrequency: 'weekly' as const,
			lastModified: siteConfig.preview.reviewedAt,
			priority: 0.6,
			url: absoluteUrl(`/status/${slug}`),
		})),
	]

	const documentation: MetadataRoute.Sitemap = documentationPages.map(
		(page) => {
			const canonicalPath = page.url.replace(/^\/fr(?=\/docs(?:\/|$))/u, '')
			const hasFrenchPage = frenchDocumentationPaths.has(canonicalPath)
			return {
				alternates: {
					languages: {
						en: absoluteUrl(canonicalPath),
						...(hasFrenchPage
							? { fr: absoluteUrl(`/fr${canonicalPath}`) }
							: {}),
					},
				},
				changeFrequency: 'weekly',
				lastModified: page.reviewedAt,
				priority: canonicalPath === '/docs' ? 0.9 : 0.8,
				url: absoluteUrl(page.url),
			}
		},
	)

	return [...marketing, ...documentation]
}
