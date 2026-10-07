import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

/** Describes the one GraphQL HTTP endpoint selected for an application. */
export interface GraphqlHttpEndpoint {
	/** Normalized same-origin path used for GraphQL HTTP requests. */
	readonly path: string
}

/** Validates and snapshots untrusted provider input before consumer exposure. */
export const normalizeGraphqlHttpEndpoint = (
	value: unknown,
): GraphqlHttpEndpoint => {
	if (!isPlainRecord(value) || Reflect.ownKeys(value).length !== 1) {
		throw new TypeError(
			'GraphQL HTTP endpoint capability must contain only path',
		)
	}
	// Read once so the snapshot is exactly the value that was validated.
	const path = value.path
	if (
		typeof path !== 'string' ||
		!path.startsWith('/') ||
		path.includes('?') ||
		path.includes('#') ||
		(path.length > 1 && path.endsWith('/'))
	) {
		throw new TypeError(
			'GraphQL HTTP endpoint path must be normalized and absolute',
		)
	}
	const segments = path === '/' ? [] : path.slice(1).split('/')
	if (segments.some((segment) => segment.length === 0)) {
		throw new TypeError(
			'GraphQL HTTP endpoint path must not contain empty segments',
		)
	}
	for (const segment of segments) {
		let decoded: string
		try {
			decoded = decodeURIComponent(segment)
		} catch {
			throw new TypeError(
				'GraphQL HTTP endpoint path contains invalid encoding',
			)
		}
		if (decoded === '.' || decoded === '..' || decoded.includes('/')) {
			throw new TypeError('GraphQL HTTP endpoint path must be normalized')
		}
	}
	return immutableRecord({ path })
}
