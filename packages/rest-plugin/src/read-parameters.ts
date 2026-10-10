import { immutableRecord } from '@ultimabase/shared'

import { invalidRestRead } from './errors.js'

const decodeQueryComponent = (value: string): string => {
	try {
		return decodeURIComponent(value.replaceAll('+', ' '))
	} catch {
		throw invalidRestRead()
	}
}

/** @internal Splits the raw query without merging repeated or empty names. */
export const parseRestQueryEntries = (
	request: Request,
): readonly [string, string][] => {
	let search: string
	try {
		search = new URL(request.url).search
	} catch {
		throw invalidRestRead()
	}
	if (search.length <= 1) return []
	return search
		.slice(1)
		.split('&')
		.map((entry) => {
			if (entry.length === 0) throw invalidRestRead()
			const separator = entry.indexOf('=')
			const name = decodeQueryComponent(
				separator === -1 ? entry : entry.slice(0, separator),
			)
			if (name.length === 0) throw invalidRestRead()
			const value = separator === -1 ? '' : entry.slice(separator + 1)
			return [name, decodeQueryComponent(value)] as const
		})
}

export const parseJson = (value: string): unknown => {
	try {
		return JSON.parse(value) as unknown
	} catch {
		throw invalidRestRead()
	}
}

const parseCommaList = (value: string): readonly string[] => {
	const entries = value.split(',')
	if (
		entries.some((entry) => entry.length === 0 || entry.trim() !== entry) ||
		new Set(entries).size !== entries.length
	) {
		throw invalidRestRead()
	}
	return entries
}

/** @internal Parses `select=a,b` into Core's flat selection object. */
export const parseRestSelectionParameter = (
	value: string,
): Readonly<Record<string, true>> =>
	immutableRecord(
		Object.fromEntries(parseCommaList(value).map((name) => [name, true])),
	)

export const parseOrdering = (
	value: string,
): Readonly<Record<string, 'asc' | 'desc'>> => {
	const fields = new Set<string>()
	return immutableRecord(
		Object.fromEntries(
			parseCommaList(value).map((entry) => {
				const descending = entry.startsWith('-')
				const field = descending ? entry.slice(1) : entry
				if (field.length === 0 || fields.has(field)) throw invalidRestRead()
				fields.add(field)
				return [field, descending ? 'desc' : 'asc']
			}),
		),
	)
}

export const parseNonNegativeInteger = (value: string): number => {
	const parsed = Number(value)
	if (!/^(?:0|[1-9]\d*)$/u.test(value) || !Number.isSafeInteger(parsed)) {
		throw invalidRestRead()
	}
	return parsed
}

// Maps keep request-controlled relation names away from Object.prototype.
type IncludeTree = Map<string, IncludeTree | undefined>

const includeTreeToRecord = (
	tree: IncludeTree,
): Readonly<Record<string, unknown>> =>
	Object.fromEntries(
		Array.from(tree, ([name, nested]) => [
			name,
			nested === undefined ? {} : { include: includeTreeToRecord(nested) },
		]),
	)

// Dotted paths such as `author.profile` become nested `{ include }` objects.
const parseIncludePaths = (
	value: string,
): Readonly<Record<string, unknown>> => {
	const root: IncludeTree = new Map()
	for (const path of parseCommaList(value)) {
		const segments = path.split('.')
		if (segments.some((segment) => segment.length === 0)) {
			throw invalidRestRead()
		}
		let current = root
		for (const [index, segment] of segments.entries()) {
			const existing = current.get(segment)
			if (index === segments.length - 1) {
				if (current.has(segment)) throw invalidRestRead()
				current.set(segment, undefined)
				continue
			}
			if (current.has(segment) && existing === undefined) {
				throw invalidRestRead()
			}
			const next: IncludeTree =
				existing ?? new Map<string, IncludeTree | undefined>()
			current.set(segment, next)
			current = next
		}
	}
	return immutableRecord(includeTreeToRecord(root))
}

/** @internal Accepts either JSON include arguments or dotted include paths. */
export const parseRestIncludeParameter = (value: string): unknown =>
	value.trimStart().startsWith('{')
		? parseJson(value)
		: parseIncludePaths(value)
