import { immutableRecord } from '@ultimabase/shared'

import { encodeRestPathSegment, type RestRouteDefinition } from './routes.js'

export interface MatchedRestRoute {
	readonly id?: string
	readonly route: RestRouteDefinition
}

/** @internal Rejects aliases before route lookup can guess their meaning. */
export const isCanonicalRestPath = (pathname: string): boolean => {
	if (pathname.length > 1 && pathname.endsWith('/')) return false
	const segments = pathname.slice(1).split('/')
	if (segments.some((segment) => segment.length === 0)) return false
	return segments.every((segment) => {
		try {
			return (
				encodeRestPathSegment(decodeURIComponent(segment), 'REST path') ===
				segment
			)
		} catch {
			return false
		}
	})
}

/** @internal Selects only the literal version fixed by the configured mount. */
export const hasSupportedRestVersion = (
	pathname: string,
	mountPath: string,
): boolean => {
	const versionRoot = mountPath === '/' ? '/v1' : `${mountPath}/v1`
	return pathname === versionRoot || pathname.startsWith(`${versionRoot}/`)
}

const matchesDynamicPath = (
	template: string,
	pathname: string,
): string | undefined => {
	const templateSegments = template.slice(1).split('/')
	const requestSegments = pathname.slice(1).split('/')
	if (templateSegments.length !== requestSegments.length) return undefined
	let id: string | undefined
	for (const [index, segment] of templateSegments.entries()) {
		const requestSegment = requestSegments[index]
		if (requestSegment === undefined) return undefined
		if (segment === '{id}') id = requestSegment
		else if (segment !== requestSegment) return undefined
	}
	return id
}

/** @internal Matches static routes before the one strict item placeholder. */
export const matchRestRoute = (
	routes: readonly RestRouteDefinition[],
	request: Request,
): MatchedRestRoute | undefined => {
	const pathname = new URL(request.url).pathname
	const exact = routes.find(
		(route) => route.method === request.method && route.path === pathname,
	)
	if (exact !== undefined) return immutableRecord({ route: exact })
	for (const route of routes) {
		if (route.method !== request.method || !route.path.endsWith('/{id}')) {
			continue
		}
		const id = matchesDynamicPath(route.path, pathname)
		if (id !== undefined) return immutableRecord({ id, route })
	}
	return undefined
}

/** @internal Resolves JSON compatibility using the most specific media range. */
export const readRestAcceptQuality = (value: string | null): number => {
	if (value === null) return 1
	let specificity = -1
	let quality = 0
	for (const rawRange of value.split(',')) {
		const [rawMediaType, ...rawParameters] = rawRange.split(';')
		const mediaType = rawMediaType?.trim().toLowerCase()
		const currentSpecificity =
			mediaType === 'application/json'
				? 2
				: mediaType === 'application/*'
					? 1
					: mediaType === '*/*'
						? 0
						: -1
		if (currentSpecificity < 0) continue
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
		if (currentSpecificity > specificity) {
			specificity = currentSpecificity
			quality = currentQuality
		} else if (currentSpecificity === specificity) {
			quality = Math.max(quality, currentQuality)
		}
	}
	return quality
}
