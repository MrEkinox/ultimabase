import { isDocumentationVersion } from './docs-versions'

export interface DocumentationSection {
	readonly label: string
	readonly slug: string
}

/** Canonical capability-owned sidebar order for every documentation locale. */
export const documentationSections: readonly DocumentationSection[] =
	Object.freeze([
		{ label: 'Getting Started', slug: 'getting-started' },
		{ label: 'Core', slug: 'core' },
		{ label: 'Plugins', slug: 'plugins' },
		{ label: 'Guides', slug: 'guides' },
		{ label: 'Operations', slug: 'operations' },
		{ label: 'Reference', slug: 'reference' },
	])

export function visibleDocumentationSections(
	urls: readonly string[],
): readonly DocumentationSection[] {
	return documentationSections.filter((section) =>
		urls.some((url) => {
			const documentationPath = url.replace(/^\/fr(?=\/docs(?:\/|$))/u, '')
			const [, root, version, sectionSlug] = documentationPath.split('/')
			return (
				root === 'docs' &&
				isDocumentationVersion(version) &&
				sectionSlug === section.slug
			)
		}),
	)
}
