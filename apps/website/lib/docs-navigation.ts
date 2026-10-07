import { isDocumentationVersion } from './docs-versions'

export interface DocumentationSection {
	readonly label: string
	readonly slug: string
}

/** Canonical capability-owned sidebar order. */
export const documentationSections: readonly DocumentationSection[] =
	Object.freeze([
		{ label: 'Core', slug: 'core' },
		{ label: 'Plugins', slug: 'plugins' },
		{ label: 'Guides', slug: 'guides' },
		{ label: 'Operations', slug: 'operations' },
		{ label: 'Reference', slug: 'reference' },
		{ label: 'Project', slug: 'project' },
	])

export function visibleDocumentationSections(
	urls: readonly string[],
): readonly DocumentationSection[] {
	return documentationSections.filter((section) =>
		urls.some((url) => {
			const [, root, version, sectionSlug] = url.split('/')
			return (
				root === 'docs' &&
				isDocumentationVersion(version) &&
				sectionSlug === section.slug
			)
		}),
	)
}
