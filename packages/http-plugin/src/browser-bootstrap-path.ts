import { assertNonEmptyString } from '@ultimabase/shared'

const invalidPath = (label: string): TypeError =>
	new TypeError(`${label} must be a normalized route suffix`)

/** Normalizes one application-local browser bootstrap suffix for plugin options. */
export const normalizeHttpBrowserBootstrapPath = (
	value: unknown,
	label: string,
): string => {
	assertNonEmptyString(label, 'HTTP browser bootstrap path label')
	if (
		typeof value !== 'string' ||
		!value.startsWith('/') ||
		value === '/' ||
		value.includes('?') ||
		value.includes('#') ||
		value.endsWith('/') ||
		value === '/__ultimabase/apps' ||
		value.startsWith('/__ultimabase/apps/')
	)
		throw invalidPath(label)

	for (const segment of value.slice(1).split('/')) {
		let decoded: string
		try {
			decoded = decodeURIComponent(segment)
		} catch {
			throw invalidPath(label)
		}
		if (
			segment.length === 0 ||
			decoded === '.' ||
			decoded === '..' ||
			decoded.includes('/')
		)
			throw invalidPath(label)
	}
	return value
}
