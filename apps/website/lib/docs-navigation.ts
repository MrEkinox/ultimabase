export interface DocumentationSection {
	readonly label: string
	readonly slug: string
}

/** Canonical task-oriented sidebar order for every documentation locale. */
export const documentationSections: readonly DocumentationSection[] =
	Object.freeze([
		{ label: 'Getting Started', slug: 'getting-started' },
		{ label: 'Model Your Data', slug: 'data-modeling' },
		{ label: 'Read Data', slug: 'querying' },
		{ label: 'Write Data', slug: 'mutations' },
		{ label: 'Secure Your Application', slug: 'security' },
		{ label: 'Expose APIs', slug: 'apis' },
		{ label: 'Plugins', slug: 'plugins' },
		{ label: 'Operate Your Application', slug: 'operations' },
		{ label: 'Guides', slug: 'guides' },
		{ label: 'Concepts', slug: 'concepts' },
		{ label: 'Troubleshooting', slug: 'troubleshooting' },
		{ label: 'Reference', slug: 'reference' },
	])

export function visibleDocumentationSections(
	urls: readonly string[],
): readonly DocumentationSection[] {
	return documentationSections.filter((section) =>
		urls.some((url) => {
			const documentationPath = url.replace(/^\/fr(?=\/docs(?:\/|$))/u, '')
			return documentationPath.startsWith(`/docs/${section.slug}/`)
		}),
	)
}
