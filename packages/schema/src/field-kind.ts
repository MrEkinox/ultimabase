/**
 * Lists framework-owned scalar kinds once for guards and plugin reservations.
 */
export const builtInFieldKinds = [
	'bigint',
	'binary',
	'boolean',
	'date',
	'dateTime',
	'decimal',
	'enum',
	'float',
	'int',
	'json',
	'object',
	'string',
	'time',
	'uuid',
] as const

export type BuiltInFieldKind = (typeof builtInFieldKinds)[number]

export type ReservedFieldKind = BuiltInFieldKind | 'array' | 'plugin'

const builtInFieldKindSet: ReadonlySet<string> = new Set(builtInFieldKinds)

/** Keeps kind discrimination independent from concrete field option types. */
export const isBuiltInFieldKind = (kind: string): kind is BuiltInFieldKind =>
	builtInFieldKindSet.has(kind)

/** Enforces the collision-resistant identifier shared by every field plugin. */
export const assertPluginFieldKind = (kind: unknown, path: string): string => {
	if (typeof kind !== 'string' || kind.length === 0) {
		throw new TypeError(`${path} must be a non-empty string`)
	}

	const separator = kind.indexOf('.')

	if (
		separator <= 0 ||
		separator === kind.length - 1 ||
		kind.trim() !== kind ||
		/\s/u.test(kind)
	) {
		throw new TypeError(`${path} must use a namespaced identifier`)
	}

	return kind
}
