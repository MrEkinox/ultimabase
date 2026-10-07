import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import type { StandardSchemaV1 } from '@standard-schema/spec'

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

/** Configures plugin-option validation through one Standard Schema V1 contract. */
export interface DefineStandardSchemaPluginOptionsParserOptions<
	TSchema extends StandardSchemaV1,
> {
	/** Names the option boundary in diagnostics. @example "workflow plugin options" */
	readonly name: string
	/** Validates, defaults, and transforms options through a synchronous Standard Schema implementation. */
	readonly schema: TSchema
}

/** Parses an unknown options value into one immutable exact result. */
export type PluginOptionsParser<TResult extends object, TInput = unknown> = (
	options: TInput,
) => Readonly<TResult>

const normalizedParserDefinitionKeys = new Set([
	'formatUnknownKey',
	'keys',
	'name',
	'normalize',
])
const schemaParserDefinitionKeys = new Set(['name', 'schema'])

type UnknownFunction = (...arguments_: readonly unknown[]) => unknown

const isUnknownFunction = (value: unknown): value is UnknownFunction =>
	typeof value === 'function'

const isObjectLike = (value: unknown): value is object =>
	(typeof value === 'object' || typeof value === 'function') && value !== null

const isPropertyKey = (value: unknown): value is PropertyKey =>
	typeof value === 'string' ||
	typeof value === 'number' ||
	typeof value === 'symbol'

/** Formats one issue as `path.to.key: message`; path segments may be keys or `{ key }`. */
const formatStandardSchemaIssue = (issue: unknown): string => {
	if (!isPlainRecord(issue) || typeof issue.message !== 'string') {
		return 'invalid Standard Schema issue'
	}
	if (!Array.isArray(issue.path) || issue.path.length === 0) {
		return issue.message
	}

	const path = issue.path
		.map((segment: unknown) => (isPlainRecord(segment) ? segment.key : segment))
		.filter(isPropertyKey)
		.map(String)
		.join('.')

	return path.length === 0 ? issue.message : `${path}: ${issue.message}`
}

const defineStandardSchemaParser = (
	name: string,
	schema: unknown,
): PluginOptionsParser<object> => {
	const properties: unknown = isObjectLike(schema)
		? Reflect.get(schema, '~standard')
		: undefined
	const validate = isPlainRecord(properties) ? properties.validate : undefined
	if (
		!isPlainRecord(properties) ||
		properties.version !== 1 ||
		typeof properties.vendor !== 'string' ||
		!isUnknownFunction(validate)
	) {
		throw new TypeError(
			'plugin options parser schema must implement Standard Schema V1',
		)
	}

	return (input: unknown): Readonly<object> => {
		const result: unknown = validate.call(properties, input)
		if (
			isObjectLike(result) &&
			isUnknownFunction(Reflect.get(result, 'then'))
		) {
			throw new TypeError(`${name} schema validation must be synchronous`)
		}
		if (
			!isPlainRecord(result) ||
			(result.issues !== undefined && !Array.isArray(result.issues))
		) {
			throw new TypeError(
				`${name} schema returned an invalid Standard Schema result`,
			)
		}
		if (result.issues !== undefined) {
			const details = result.issues.map(formatStandardSchemaIssue).join('; ')
			throw new TypeError(
				`${name} validation failed${details.length === 0 ? '' : `: ${details}`}`,
			)
		}
		if (!isPlainRecord(result.value)) {
			throw new TypeError(`${name} schema must return a plain object`)
		}

		return immutableRecord(result.value)
	}
}

const defineNormalizedOptionsParser = (
	name: string,
	options: Readonly<Record<PropertyKey, unknown>>,
): PluginOptionsParser<object> => {
	if (!Array.isArray(options.keys)) {
		throw new TypeError('plugin options parser keys must be an array')
	}
	if (!isUnknownFunction(options.normalize)) {
		throw new TypeError('plugin options parser normalize must be a function')
	}
	if (
		options.formatUnknownKey !== undefined &&
		!isUnknownFunction(options.formatUnknownKey)
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
	const normalize = options.normalize
	const customFormatUnknownKey = options.formatUnknownKey

	return (input: unknown): Readonly<object> => {
		if (!isPlainRecord(input)) {
			throw new TypeError(`${name} must be a plain object`)
		}
		for (const key of Reflect.ownKeys(input)) {
			if (typeof key !== 'string' || !knownKeys.has(key)) {
				const customMessage = customFormatUnknownKey?.(key)
				throw new TypeError(
					typeof customMessage === 'string'
						? customMessage
						: `Unknown ${name} key: ${String(key)}`,
				)
			}
		}

		const normalized = normalize(immutableRecord({ ...input }))
		if (!isPlainRecord(normalized)) {
			throw new TypeError(`${name} normalizer must return a plain object`)
		}

		return immutableRecord(normalized)
	}
}

/**
 * Creates a reusable immutable plugin-options boundary.
 * Use either explicit keys plus a normalizer or one synchronous Standard Schema.
 * Nested values remain owned by the supplied contract; the returned root is frozen.
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
export function definePluginOptionsParser<
	const TSchema extends StandardSchemaV1,
>(
	options: StandardSchemaV1.InferOutput<TSchema> extends object
		? DefineStandardSchemaPluginOptionsParserOptions<TSchema>
		: never,
): PluginOptionsParser<
	Extract<StandardSchemaV1.InferOutput<TSchema>, object>,
	StandardSchemaV1.InferInput<TSchema>
>
export function definePluginOptionsParser<
	const TKeys extends readonly string[],
	TResult extends object,
>(
	options: DefinePluginOptionsParserOptions<TKeys, TResult>,
): PluginOptionsParser<TResult>
export function definePluginOptionsParser(
	options: unknown,
): PluginOptionsParser<object> {
	if (!isPlainRecord(options)) {
		throw new TypeError(
			'plugin options parser definition must be a plain object',
		)
	}
	const usesStandardSchema = Object.hasOwn(options, 'schema')
	const definitionKeys = usesStandardSchema
		? schemaParserDefinitionKeys
		: normalizedParserDefinitionKeys
	for (const key of Reflect.ownKeys(options)) {
		if (typeof key !== 'string' || !definitionKeys.has(key)) {
			throw new TypeError(
				`Unknown plugin options parser definition option: ${String(key)}`,
			)
		}
	}
	assertNonEmptyString(options.name, 'plugin options parser name')

	return usesStandardSchema
		? defineStandardSchemaParser(options.name, options.schema)
		: defineNormalizedOptionsParser(options.name, options)
}
