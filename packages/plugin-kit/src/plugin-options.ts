import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

/** Exposes only declared option keys as untrusted values to one normalizer. */
export type PluginOptionValues<TKeys extends readonly string[]> = Readonly<
	Partial<Record<TKeys[number], unknown>>
>

/** Configures strict root-key validation and one plugin-owned value normalizer. */
export interface DefinePluginOptionsParserOptions<
	TKeys extends readonly string[],
	TResult extends object,
> {
	/** Preserves a plugin-specific unknown-key diagnostic when migrating an existing parser. */
	readonly formatUnknownKey?: (key: PropertyKey) => string
	/** Lists every accepted root key. @example `["instanceId", "mode"]` */
	readonly keys: TKeys
	/** Names the option boundary in diagnostics. @example "workflow plugin options" */
	readonly name: string
	/** Validates values and returns a detached normalized root object. */
	readonly normalize: (options: PluginOptionValues<TKeys>) => TResult
}

/** Parses an unknown options value into one immutable exact result. */
export type PluginOptionsParser<TResult extends object> = (
	options: unknown,
) => Readonly<TResult>

const parserDefinitionKeys = new Set([
	'formatUnknownKey',
	'keys',
	'name',
	'normalize',
])

/**
 * Creates a reusable strict plugin-options boundary without choosing a schema library.
 * Nested values remain owned by the supplied normalizer; the returned root is frozen.
 *
 * @example
 * ```ts
 * const parseOptions = definePluginOptionsParser({
 *   name: 'workflow plugin options',
 *   keys: ['mode'] as const,
 *   normalize: ({ mode }) => ({ mode: mode ?? 'review' }),
 * })
 * ```
 */
export const definePluginOptionsParser = <
	const TKeys extends readonly string[],
	TResult extends object,
>(
	options: DefinePluginOptionsParserOptions<TKeys, TResult>,
): PluginOptionsParser<TResult> => {
	if (!isPlainRecord(options)) {
		throw new TypeError(
			'plugin options parser definition must be a plain object',
		)
	}
	for (const key of Reflect.ownKeys(options)) {
		if (typeof key !== 'string' || !parserDefinitionKeys.has(key)) {
			throw new TypeError(
				`Unknown plugin options parser definition option: ${String(key)}`,
			)
		}
	}
	assertNonEmptyString(options.name, 'plugin options parser name')
	if (!Array.isArray(options.keys)) {
		throw new TypeError('plugin options parser keys must be an array')
	}
	if (typeof options.normalize !== 'function') {
		throw new TypeError('plugin options parser normalize must be a function')
	}
	if (
		options.formatUnknownKey !== undefined &&
		typeof options.formatUnknownKey !== 'function'
	) {
		throw new TypeError(
			'plugin options parser formatUnknownKey must be a function',
		)
	}

	const keys = immutableArray(options.keys)
	const knownKeys = new Set<string>()
	for (const [index, key] of keys.entries()) {
		assertNonEmptyString(key, `plugin options parser keys[${String(index)}]`)
		if (knownKeys.has(key)) {
			throw new TypeError(`Duplicate plugin option key: ${key}`)
		}
		knownKeys.add(key)
	}
	const name = options.name
	const normalize = options.normalize
	const formatUnknownKey =
		options.formatUnknownKey ??
		((key: PropertyKey): string => `Unknown ${name} key: ${String(key)}`)

	return (input: unknown): Readonly<TResult> => {
		if (!isPlainRecord(input)) {
			throw new TypeError(`${name} must be a plain object`)
		}
		for (const key of Reflect.ownKeys(input)) {
			if (typeof key !== 'string' || !knownKeys.has(key)) {
				throw new TypeError(formatUnknownKey(key))
			}
		}

		const normalized = normalize(
			immutableRecord({ ...input }) as PluginOptionValues<TKeys>,
		)
		if (!isPlainRecord(normalized)) {
			throw new TypeError(`${name} normalizer must return a plain object`)
		}

		return immutableRecord(normalized)
	}
}
