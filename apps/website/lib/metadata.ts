import type { Metadata } from 'next'

import { siteConfig } from './site'

export interface PublicPageMetadataOptions {
	readonly absoluteTitle?: boolean
	readonly canonicalPath: string
	readonly description: string
	readonly title: string
}

/** Keeps canonical, Open Graph, and X metadata aligned for every public page. */
export function createPublicPageMetadata({
	absoluteTitle = false,
	canonicalPath,
	description,
	title,
}: PublicPageMetadataOptions): Metadata {
	const canonicalUrl = new URL(canonicalPath, siteConfig.canonicalUrl)

	return {
		alternates: {
			canonical: canonicalUrl.href,
		},
		description,
		openGraph: {
			description,
			locale: 'en_US',
			siteName: siteConfig.name,
			title,
			type: 'website',
			url: canonicalUrl,
		},
		title: absoluteTitle ? { absolute: title } : title,
		twitter: {
			card: 'summary',
			description,
			title,
		},
	}
}
