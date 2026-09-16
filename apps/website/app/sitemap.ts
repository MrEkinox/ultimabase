import type { MetadataRoute } from 'next'

import { statusPageSlugs } from '../components/status/content'
import { createPublicSitemap } from '../lib/public-sitemap'
import { source } from '../lib/source'

/** Publishes only canonical reader routes. */
export default function sitemap(): MetadataRoute.Sitemap {
	return createPublicSitemap(
		source.getPages().map((page) => ({
			reviewedAt: page.data.reviewedAt,
			url: page.url,
		})),
		statusPageSlugs,
	)
}
