import type { MetadataRoute } from 'next'

import { exampleScenarios } from '../components/examples/content'
import { statusPageSlugs } from '../components/status/content'
import { createPublicSitemap } from '../lib/public-sitemap'
import { source } from '../lib/source'

/** Publishes only canonical reader routes; translation fallbacks stay discoverable by navigation. */
export default function sitemap(): MetadataRoute.Sitemap {
	return createPublicSitemap(
		source.getPages().map((page) => ({
			...(page.locale === undefined ? {} : { locale: page.locale }),
			reviewedAt: page.data.reviewedAt,
			url: page.url,
		})),
		exampleScenarios.map((scenario) => scenario.slug),
		statusPageSlugs,
	)
}
