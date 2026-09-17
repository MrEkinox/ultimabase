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
	readonly sourceExampleUrl: URL
	readonly sourceRepository: {
		readonly branch: string
		readonly name: string
		readonly owner: string
	}
	readonly routes: {
		readonly contributing: string
		readonly docs: string
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
const sourceExampleUrl = new URL(
	`${repositoryUrl.href}/blob/${sourceRepository.branch}/examples/minimal/README.md`,
)
const preview: SiteConfig['preview'] = Object.freeze({
	indexable: false,
	reviewedAt: '2026-09-14',
})
const routes: SiteConfig['routes'] = Object.freeze({
	contributing: currentDocumentationPath('project/contributing'),
	docs: currentDocumentationPath(),
	plugins: `${currentDocumentationPath('plugins/overview')}#official-plugins`,
	releaseStatus: currentDocumentationPath('project/release-status'),
	roadmap: currentDocumentationPath('project/roadmap'),
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
		'UltimaBase is an open-source TypeScript backend framework for typed data APIs built from schemas and optional plugins.',
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
	sourceExampleUrl,
	sourceRepository,
	routes,
} satisfies SiteConfig)
