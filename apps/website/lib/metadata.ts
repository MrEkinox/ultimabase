import type { Metadata } from 'next'

import type { SiteLocale } from './i18n'
import { siteConfig } from './site'

export interface PublicPageMetadataOptions {
	readonly absoluteTitle?: boolean
	readonly canonicalPath: string
	readonly description: string
	readonly languages?: Readonly<Partial<Record<SiteLocale, string>>>
	readonly locale: SiteLocale
	readonly title: string
}

/** Keeps canonical, Open Graph, and X metadata aligned for every public page. */
export function createPublicPageMetadata({
	absoluteTitle = false,
	canonicalPath,
	description,
	languages,
	locale,
	title,
}: PublicPageMetadataOptions): Metadata {
	const canonicalUrl = new URL(canonicalPath, siteConfig.canonicalUrl)
	const languageUrls =
		languages === undefined
			? undefined
			: Object.fromEntries(
					Object.entries(languages).map(([language, pathname]) => [
						language,
						new URL(pathname, siteConfig.canonicalUrl).href,
					]),
				)

	return {
		alternates: {
			canonical: canonicalUrl,
			...(languageUrls === undefined ? {} : { languages: languageUrls }),
		},
		description,
		openGraph: {
			description,
			locale: locale === 'fr' ? 'fr_FR' : 'en_US',
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
