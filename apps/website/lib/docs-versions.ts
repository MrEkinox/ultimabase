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

const legacyDocumentationPaths: Readonly<Record<string, string>> =
	Object.freeze({
		'apis/errors': 'core/runtime/api-errors',
		'apis/graphql': 'plugins/official/http-and-apis/graphql',
		'apis/graphql-yoga': 'plugins/official/http-and-apis/graphql-yoga',
		'apis/http-applications': 'plugins/official/http-and-apis/http',
		'apis/rest': 'plugins/official/http-and-apis/rest',
		'apis/typescript': 'core/application/direct-typescript',
		'concepts/application-graph': 'core/application/application-graph',
		'concepts/architecture-decisions': 'reference/architecture-decisions',
		'concepts/immutability': 'core/runtime/immutability',
		'concepts/logical-operations-and-persistence':
			'core/runtime/logical-operations-and-persistence',
		'concepts/request-context': 'core/application/request-context',
		'concepts/runtime-pipeline': 'core/runtime/runtime-pipeline',
		'concepts/transactions': 'core/runtime/transaction-boundaries',
		'concepts/typegen': 'core/application/typegen',
		'core/data-modeling/relationships/pointers':
			'core/data-modeling/relationships',
		'core/data-modeling/relationships/relations':
			'core/data-modeling/relationships',
		'core/reading-data/including-related-data':
			'core/reading-data/related-data',
		'core/reading-data/relationship-queries/contextual-relations':
			'core/reading-data/related-data',
		'core/reading-data/relationship-queries/relation-predicates':
			'core/reading-data/related-data',
		'data-modeling/pointers': 'core/data-modeling/relationships',
		'data-modeling/relations': 'core/data-modeling/relationships',
		'guides/add-soft-delete':
			'plugins/official/data-and-persistence/soft-delete',
		'guides/run-lifecycle-hooks':
			'plugins/official/validation-and-lifecycle/hooks',
		'guides/validate-input':
			'plugins/official/validation-and-lifecycle/validation',
		'getting-started/next-steps': 'getting-started/first-application',
		'getting-started/project-structure': 'getting-started/first-application',
		'mutations/soft-delete':
			'plugins/official/data-and-persistence/soft-delete',
		'operations/application-lifecycle': 'core/application/lifecycle',
		'operations/application-troubleshooting/reporting-a-problem':
			'operations/application-troubleshooting',
		'operations/application-troubleshooting/startup':
			'operations/application-troubleshooting',
		'operations/application-troubleshooting/typegen':
			'operations/application-troubleshooting',
		'operations/browser-policy': 'plugins/official/http-and-apis/http',
		'operations/postgres': 'plugins/official/data-and-persistence/postgresql',
		'operations/secrets-and-master-key': 'operations/secrets',
		'plugins/authoring': 'plugins/build-a-plugin',
		'plugins/build-a-plugin/capabilities': 'plugins/build-a-plugin',
		'plugins/build-a-plugin/getting-started': 'plugins/build-a-plugin',
		'plugins/build-a-plugin/identity-and-instances': 'plugins/build-a-plugin',
		'plugins/build-a-plugin/lifecycle-and-dependencies':
			'plugins/build-a-plugin',
		'plugins/build-a-plugin/manifests-and-privileges': 'plugins/build-a-plugin',
		'plugins/build-a-plugin/plugin-manifest-reference':
			'plugins/build-a-plugin',
		'plugins/build-a-plugin/publishing': 'plugins/build-a-plugin',
		'plugins/build-a-plugin/testing': 'plugins/build-a-plugin',
		'plugins/capabilities': 'plugins/build-a-plugin',
		'plugins/community': 'plugins/community-plugins',
		'plugins/community/plugin-catalog': 'plugins/community-plugins',
		'plugins/community/publishing-requirements': 'plugins/community-plugins',
		'plugins/community/submit-a-plugin': 'plugins/community-plugins',
		'plugins/identity-and-instances': 'plugins/build-a-plugin',
		'plugins/installation': 'plugins/using-plugins',
		'plugins/lifecycle-and-dependencies': 'plugins/build-a-plugin',
		'plugins/manifests-and-privileges': 'plugins/build-a-plugin',
		'plugins/official': 'plugins/overview',
		'plugins/official-plugins': 'plugins/overview',
		'plugins/plugin-ecosystem': 'plugins/overview',
		'plugins/plugin-ecosystem/choosing-a-plugin': 'plugins/using-plugins',
		'plugins/plugin-ecosystem/compatibility': 'plugins/using-plugins',
		'plugins/plugin-ecosystem/install-a-plugin': 'plugins/using-plugins',
		'plugins/official/data-and-persistence/postgresql/troubleshooting':
			'plugins/official/data-and-persistence/postgresql',
		'plugins/official/data-and-persistence/soft-delete/getting-started':
			'plugins/official/data-and-persistence/soft-delete',
		'plugins/official/http-and-apis/http/browser-policy':
			'plugins/official/http-and-apis/http',
		'plugins/official/http-and-apis/http/troubleshooting':
			'plugins/official/http-and-apis/http',
		'plugins/official/validation-and-lifecycle/hooks/getting-started':
			'plugins/official/validation-and-lifecycle/hooks',
		'plugins/official/validation-and-lifecycle/validation/getting-started':
			'plugins/official/validation-and-lifecycle/validation',
		'reference/application-configuration': 'reference/core-api/application',
		'reference/errors': 'reference/core-api/errors',
		'reference/fields': 'reference/core-api/fields',
		'reference/models': 'reference/core-api/models',
		'reference/compatibility/ultimabase-versions': 'reference/compatibility',
		'reference/official-plugin-options': 'plugins/overview',
		'reference/packages': 'reference/package-index',
		'reference/plugin-manifests': 'plugins/build-a-plugin',
		'reference/query': 'reference/core-api/query',
		'reference/schema': 'reference/core-api/schema',
		'querying/contextual-relations': 'core/reading-data/related-data',
		'querying/includes': 'core/reading-data/related-data',
		'querying/relation-predicates': 'core/reading-data/related-data',
		'security/access':
			'plugins/official/authentication-and-authorization/access',
		'security/acl':
			'plugins/official/authentication-and-authorization/acl-permissions',
		'security/master-authority': 'core/security-foundations/master-authority',
		'security/overview': 'core/security-foundations/security-model',
		'security/password-authentication':
			'plugins/official/authentication-and-authorization/password-authentication',
		'security/request-identity': 'core/security-foundations/request-identity',
		'security/roles': 'plugins/official/authentication-and-authorization/roles',
		'troubleshooting/http-and-application-identity':
			'plugins/official/http-and-apis/http',
		'troubleshooting/postgres':
			'plugins/official/data-and-persistence/postgresql',
		'troubleshooting/reporting-a-problem':
			'operations/application-troubleshooting',
		'troubleshooting/startup': 'operations/application-troubleshooting',
		'troubleshooting/typegen': 'operations/application-troubleshooting',
	})

const legacyDocumentationPrefixes = Object.freeze([
	['data-modeling/', 'core/data-modeling/'],
	['mutations/', 'core/writing-data/'],
	['querying/', 'core/reading-data/'],
] as const)

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

export function resolveLegacyDocumentationPath(relativePath: string): string {
	const exactPath = legacyDocumentationPaths[relativePath]
	if (exactPath !== undefined) return exactPath

	for (const [legacyPrefix, canonicalPrefix] of legacyDocumentationPrefixes) {
		if (relativePath.startsWith(legacyPrefix)) {
			return `${canonicalPrefix}${relativePath.slice(legacyPrefix.length)}`
		}
	}

	return relativePath
}

/** Builds a canonical English URL for the newest supported documentation line. */
export function currentDocumentationPath(relativePath = ''): string {
	return documentationPath(relativePath)
}

export function versionDocumentationSlug(
	slug: readonly string[] | undefined,
): string[] {
	const version = isDocumentationVersion(slug?.[0])
		? slug[0]
		: currentDocumentationVersion.slug
	const relativeSlug = isDocumentationVersion(slug?.[0]) ? slug.slice(1) : slug
	const canonicalPath = resolveLegacyDocumentationPath(
		relativeSlug?.join('/') ?? '',
	)
	return [
		version,
		...(canonicalPath.length === 0 ? [] : canonicalPath.split('/')),
	]
}
