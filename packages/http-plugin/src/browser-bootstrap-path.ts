import { assertNonEmptyString } from '@ultimabase/shared'

import { isReservedHttpPath } from './constants.js'

/** Normalizes one application-local browser bootstrap suffix for plugin options. */
export const normalizeHttpBrowserBootstrapPath = (
	value: unknown,
	label: string,
): string => {
	assertNonEmptyString(label, 'HTTP browser bootstrap path label')
	const invalid = (): TypeError =>
		new TypeError(`${label} must be a normalized route suffix`)
	if (
		typeof value !== 'string' ||
		!value.startsWith('/') ||
		value === '/' ||
		value.includes('?') ||
		value.includes('#') ||
		value.endsWith('/') ||
		isReservedHttpPath(value)
	)
		throw invalid()

	// Each segment must stay one non-empty, non-traversing segment once decoded.
	for (const segment of value.slice(1).split('/')) {
		let decoded: string
		try {
			decoded = decodeURIComponent(segment)
		} catch {
			throw invalid()
		}
		if (
			segment.length === 0 ||
			decoded === '.' ||
			decoded === '..' ||
			decoded.includes('/')
		)
			throw invalid()
	}
	return value
}
