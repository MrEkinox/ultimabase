import type { MetadataRoute } from 'next'

import { siteConfig } from '../lib/site'

/** Keeps the private preview out of indexes until launch is explicitly approved. */
export default function robots(): MetadataRoute.Robots {
	const rules = siteConfig.preview.indexable
		? { allow: '/', userAgent: '*' }
		: { disallow: '/', userAgent: '*' }

	return {
		host: siteConfig.canonicalUrl.origin,
		rules,
		sitemap: new URL('/sitemap.xml', siteConfig.canonicalUrl).href,
	}
}
