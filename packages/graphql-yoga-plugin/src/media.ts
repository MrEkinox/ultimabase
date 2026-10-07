export const graphqlResponseMediaType = 'application/graphql-response+json'
export const legacyGraphqlMediaType = 'application/json'

export type GraphqlResponseMediaType =
	typeof graphqlResponseMediaType | typeof legacyGraphqlMediaType

const qualityFor = (parameters: readonly string[]): number => {
	let quality = 1
	let seen = false
	for (const parameter of parameters) {
		const [rawName, rawValue, ...extra] = parameter.split('=')
		if (rawName?.trim().toLowerCase() !== 'q') continue
		if (seen || rawValue === undefined || extra.length > 0) return 0
		seen = true
		const parsed = Number(rawValue.trim())
		if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return 0
		quality = parsed
	}
	return quality
}

/** Selects only the two synchronous GraphQL response representations in v1. */
export const selectGraphqlResponseMediaType = (
	header: string | null,
): GraphqlResponseMediaType | undefined => {
	if (header === null || header.trim() === '') return graphqlResponseMediaType
	let graphqlQuality = -1
	let legacyQuality = -1
	for (const entry of header.split(',')) {
		const [rawType, ...parameters] = entry.split(';')
		const mediaType = rawType?.trim().toLowerCase()
		const quality = qualityFor(parameters)
		if (quality <= 0) continue
		if (mediaType === graphqlResponseMediaType || mediaType === '*/*') {
			graphqlQuality = Math.max(graphqlQuality, quality)
		}
		if (mediaType === legacyGraphqlMediaType) {
			legacyQuality = Math.max(legacyQuality, quality)
		}
	}
	if (graphqlQuality < 0 && legacyQuality < 0) return undefined
	return graphqlQuality >= legacyQuality
		? graphqlResponseMediaType
		: legacyGraphqlMediaType
}

/** Accepts JSON with no charset or one explicit UTF-8 charset. */
export const hasGraphqlJsonContentType = (header: string | null): boolean => {
	if (header === null) return false
	const [rawType, ...parameters] = header.split(';')
	if (rawType?.trim().toLowerCase() !== legacyGraphqlMediaType) return false
	if (parameters.length === 0) return true
	if (parameters.length !== 1) return false
	const [rawName, rawValue, ...extra] = parameters[0]?.split('=') ?? []
	if (extra.length > 0 || rawName?.trim().toLowerCase() !== 'charset') {
		return false
	}
	const charset = rawValue?.trim().replaceAll('"', '').toLowerCase()
	return charset === 'utf-8' || charset === 'utf8'
}
