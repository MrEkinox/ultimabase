import { encodeRestPathSegment, type RestRouteDefinition } from './routes.js'
import { reservedSchemaRouteSegments } from './schema-routes.js'

// Rejects aliases (empty, trailing, or non-canonically encoded segments) up front.
export const isCanonicalPath = (pathname: string): boolean => {
	if (pathname.length > 1 && pathname.endsWith('/')) return false
	return pathname
		.slice(1)
		.split('/')
		.every((segment) => {
			try {
				return (
					segment.length > 0 &&
					encodeRestPathSegment(decodeURIComponent(segment), 'REST path') ===
						segment
				)
			} catch {
				return false
			}
		})
}

// Matches static routes before the one strict `{id}` item placeholder.
export const matchRoute = (
	routes: readonly RestRouteDefinition[],
	method: string,
	pathname: string,
): Readonly<{ id?: string; route: RestRouteDefinition }> | undefined => {
	const exact = routes.find(
		(route) => route.method === method && route.path === pathname,
	)
	if (exact !== undefined) return { route: exact }
	const requestSegments = pathname.slice(1).split('/')
	for (const route of routes) {
		if (route.method !== method || !route.path.includes('{id}')) continue
		const segments = route.path.slice(1).split('/')
		if (segments.length !== requestSegments.length) continue
		let id: string | undefined
		const matches = segments.every((segment, index) => {
			const requestSegment = requestSegments[index]
			if (segment !== '{id}') return segment === requestSegment
			id = requestSegment
			return true
		})
		if (!matches || id === undefined) continue
		// A disabled collection route such as `/count` is not an item id: it must
		// answer "route not found", not "invalid id".
		if (
			route.kind !== 'rest-plugin-operation-route' &&
			reservedSchemaRouteSegments.has(id)
		)
			continue
		return { id, route }
	}
	return undefined
}

/**
 * Matches one path template; its `{id}` segment accepts any value except a
 * collection segment such as `count`, which is never an item identifier.
 */
export const matchesTemplate = (
	template: string,
	pathname: string,
): boolean => {
	const segments = template.slice(1).split('/')
	const requestSegments = pathname.slice(1).split('/')
	return (
		segments.length === requestSegments.length &&
		segments.every((segment, index) => {
			const requestSegment = requestSegments[index] ?? ''
			return segment === '{id}'
				? !reservedSchemaRouteSegments.has(requestSegment)
				: segment === requestSegment
		})
	)
}

/**
 * Lists the methods of one path when it exists with another method, or
 * when it is a disabled method of an exposed schema (both answer 405).
 */
export const readAllowedMethods = (
	configuration:
		| Readonly<{
				knownPaths: readonly string[]
				routes: readonly RestRouteDefinition[]
		  }>
		| undefined,
	pathname: string,
): readonly string[] | undefined => {
	if (configuration === undefined) return undefined
	const allowed = [
		...new Set(
			configuration.routes
				.filter(({ path }) => matchesTemplate(path, pathname))
				.map(({ method }) => method),
		),
	].sort()
	return allowed.length > 0 ||
		configuration.knownPaths.some((path) => matchesTemplate(path, pathname))
		? allowed
		: undefined
}

/** @internal Resolves JSON compatibility using the most specific media range. */
export const readRestAcceptQuality = (value: string | null): number => {
	if (value === null) return 1
	let specificity = -1
	let quality = 0
	for (const rawRange of value.split(',')) {
		const [rawMediaType, ...rawParameters] = rawRange.split(';')
		const current = ['*/*', 'application/*', 'application/json'].indexOf(
			rawMediaType?.trim().toLowerCase() ?? '',
		)
		if (current < 0) continue
		let currentQuality = 1
		let valid = true
		let qualitySeen = false
		for (const rawParameter of rawParameters) {
			const parameter = rawParameter.trim().toLowerCase()
			if (parameter === 'charset=utf-8' || parameter === 'charset="utf-8"') {
				continue
			}
			if (!parameter.startsWith('q=') || qualitySeen) {
				valid = false
				continue
			}
			qualitySeen = true
			const parsed = Number(parameter.slice(2))
			if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) valid = false
			else currentQuality = parsed
		}
		if (!valid) continue
		if (current > specificity) {
			specificity = current
			quality = currentQuality
		} else if (current === specificity) {
			quality = Math.max(quality, currentQuality)
		}
	}
	return quality
}
