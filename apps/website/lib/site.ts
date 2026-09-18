import {
	currentDocumentationPath,
	currentDocumentationVersion,
	type DocumentationVersion,
} from './docs-versions'

const developmentUrl = 'http://localhost:3000'

export type SiteReleaseStatus = DocumentationVersion['status']

export interface SiteNavigationItem {
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

/** Reject a public build that would publish an unindexable or local identity. */
export function assertPublicBuildReady(url: URL, indexable: boolean): void {
	if (!indexable) {
		throw new Error(
			'Public website build requires NEXT_PUBLIC_SITE_INDEXABLE=true.',
		)
	}
	if (
		url.protocol !== 'https:' ||
		url.hostname === 'localhost' ||
		url.hostname.endsWith('.localhost') ||
		url.hostname === '127.0.0.1' ||
		url.hostname === '[::1]' ||
		url.pathname !== '/' ||
		url.search !== '' ||
		url.hash !== ''
	) {
		throw new Error(
			'Public website build requires NEXT_PUBLIC_SITE_URL to be a public HTTPS origin.',
		)
	}
}

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
	indexable: process.env.NEXT_PUBLIC_SITE_INDEXABLE === 'true',
	reviewedAt: '2026-09-18',
})

if (process.env.ULTIMABASE_PUBLIC_BUILD === '1' || preview.indexable) {
	assertPublicBuildReady(canonicalUrl, preview.indexable)
}
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
		'Build typed data APIs with a TypeScript backend framework. Compose PostgreSQL, REST, GraphQL, authentication, and access-control plugins.',
	name: 'UltimaBase',
	navigation: Object.freeze([
		{ href: routes.docs, label: 'Documentation' },
		{ href: routes.plugins, label: 'Plugins' },
	]),
	preview,
	releaseStatus: currentDocumentationVersion.status,
	repositoryUrl,
	sourceExampleUrl,
	sourceRepository,
	routes,
} satisfies SiteConfig)
