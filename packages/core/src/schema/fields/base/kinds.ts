import { assertNonEmptyString } from '@ultimabase/shared'

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
	'pointer',
	'relation',
	'string',
	'time',
	'uuid',
] as const

export type BuiltInFieldKind = (typeof builtInFieldKinds)[number]

export type ReservedFieldKind = BuiltInFieldKind | 'array' | 'plugin'

/** Rejects framework-reserved or non-namespaced kinds at public type boundaries. */
export type AvailablePluginFieldKind<TKind extends string> =
	TKind extends ReservedFieldKind
		? never
		: TKind extends `${infer TNamespace}.${infer TName}`
			? TNamespace extends ''
				? never
				: TName extends ''
					? never
					: TKind
			: never

const builtInFieldKindSet: ReadonlySet<string> = new Set(builtInFieldKinds)

/** Keeps kind discrimination independent from concrete field option types. */
export const isBuiltInFieldKind = (kind: string): kind is BuiltInFieldKind =>
	builtInFieldKindSet.has(kind)

/** Enforces the collision-resistant identifier shared by every field plugin. */
export const assertPluginFieldKind = (kind: unknown, path: string): string => {
	assertNonEmptyString(kind, path)

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
