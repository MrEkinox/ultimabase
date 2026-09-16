import { currentDocumentationPath } from './docs-versions'

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
	readonly preview: {
		readonly indexable: boolean
		readonly reviewedAt: string
	}
	readonly releaseStatus: SiteReleaseStatus
	readonly repositoryUrl: URL
	readonly sourceRepository: {
		readonly branch: string
		readonly name: string
		readonly owner: string
	}
	readonly routes: {
		readonly contributing: string
		readonly docs: string
		readonly gettingStarted: string
		readonly plugins: string
		readonly releaseStatus: string
		readonly roadmap: string
	}
}

const canonicalUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? developmentUrl)
const sourceRepository = Object.freeze({
	branch: 'main',
	name: 'ultimadatabase',
	owner: 'MrEkinox',
})
const repositoryUrl = new URL(
	`https://github.com/${sourceRepository.owner}/${sourceRepository.name}`,
)
const preview: SiteConfig['preview'] = Object.freeze({
	indexable: false,
	reviewedAt: '2026-09-14',
})
const routes: SiteConfig['routes'] = Object.freeze({
	contributing: '/status/contributing',
	docs: currentDocumentationPath(),
	gettingStarted: currentDocumentationPath('manual-installation'),
	plugins: currentDocumentationPath('plugins/overview'),
	releaseStatus: '/status/release-status',
	roadmap: '/status/roadmap',
})

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
		{ href: routes.docs, label: 'Docs' },
		{ href: routes.plugins, label: 'Plugins' },
		{
			external: true,
			href: repositoryUrl.href,
			label: 'GitHub',
		},
	]),
	preview,
	releaseStatus: 'pre-release',
	repositoryUrl,
	sourceRepository,
	routes,
} satisfies SiteConfig)
