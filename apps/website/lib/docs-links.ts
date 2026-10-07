import { isDocumentationVersion } from './docs-versions'
import { siteConfig } from './site'

const contentPrefix = 'apps/website/content/docs/'
const publicPagePath =
	/^[a-z0-9-]+(?:\.[a-z0-9-]+)*(?:\/[a-z0-9-]+)*\/[a-z0-9-]+\.mdx$/u

export interface DocumentationEditOptions {
	readonly owner: string
	readonly path: string
	readonly repo: string
	readonly sha: string
}

/** Resolves one Fumadocs virtual path to its exact repository source file. */
export function documentationSourcePath(pagePath: string): string {
	const [version] = pagePath.split('/')
	if (!publicPagePath.test(pagePath) || !isDocumentationVersion(version)) {
		throw new TypeError(`Invalid public documentation source path: ${pagePath}`)
	}
	return `${contentPrefix}${pagePath}`
}

/** Resolves the source-edit coordinates consumed by the documentation shell. */
export function documentationEditOptions(
	pagePath: string,
): DocumentationEditOptions {
	const repository = siteConfig.sourceRepository
	return {
		owner: repository.owner,
		path: documentationSourcePath(pagePath),
		repo: repository.name,
		sha: repository.branch,
	}
}

/** Builds the stable source-edit URL shown on each authored documentation page. */
export function documentationEditUrl(pagePath: string): URL {
	const { owner, path, repo, sha } = documentationEditOptions(pagePath)
	return new URL(`https://github.com/${owner}/${repo}/blob/${sha}/${path}`)
}
