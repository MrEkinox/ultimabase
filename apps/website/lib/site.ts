const developmentUrl = 'http://localhost:3000'

export type SiteReleaseStatus = 'pre-release'

export interface SiteNavigationItem {
	readonly external?: boolean
	readonly href: string
	readonly label: string
}

export interface SiteConfig {
	readonly canonicalUrl: URL
	readonly description: string
	readonly name: string
	readonly navigation: readonly SiteNavigationItem[]
	readonly releaseStatus: SiteReleaseStatus
	readonly repositoryUrl: URL
}

const canonicalUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? developmentUrl)
const repositoryUrl = new URL('https://github.com/MrEkinox/ultimadatabase')

/**
 * Provisional public identity for the website.
 *
 * Keep mutable brand and deployment decisions here until the product name and
 * canonical domain have been selected.
 */
export const siteConfig = Object.freeze({
	canonicalUrl,
	description:
		'A typed TypeScript backend framework with explicit plugins and one runtime path.',
	name: 'UltimaBase',
	navigation: Object.freeze([
		{ href: '/docs', label: 'Docs' },
		{
			external: true,
			href: repositoryUrl.href,
			label: 'GitHub',
		},
	]),
	releaseStatus: 'pre-release',
	repositoryUrl,
} satisfies SiteConfig)
