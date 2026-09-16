export interface DocumentationVersion {
	readonly label: string
	readonly slug: string
}

/** Supported documentation lines, newest first. */
export const documentationVersions = Object.freeze([
	{ label: '1.0', slug: '1.0' },
] as const satisfies readonly DocumentationVersion[])

export type DocumentationVersionSlug =
	(typeof documentationVersions)[number]['slug']

export const currentDocumentationVersion = documentationVersions[0]

export function isDocumentationVersion(
	value: string | undefined,
): value is DocumentationVersionSlug {
	return documentationVersions.some((version) => version.slug === value)
}

export function documentationPath(
	relativePath = '',
	version: DocumentationVersion = currentDocumentationVersion,
): string {
	const normalizedPath = relativePath.replace(/^\/+|\/+$/gu, '')
	return `/docs/${version.slug}${
		normalizedPath.length === 0 ? '' : `/${normalizedPath}`
	}`
}

/** Builds an English URL for the newest supported documentation line. */
export function currentDocumentationPath(relativePath = ''): string {
	return documentationPath(relativePath)
}
