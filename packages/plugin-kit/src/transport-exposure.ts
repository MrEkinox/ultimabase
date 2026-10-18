import type {
	ApplicationExposurePlan,
	ApplicationOperationTransportPlanner,
	ExposedWriteMethod,
	OperationTransportProtocol,
} from '@ultimabase/core'
import {
	isPluginOperationDefinition,
	normalizeExposureRule,
	type NativeExposureRules,
	type NormalizedExposureRule,
	type PluginOperationDefinition,
} from '@ultimabase/core/plugin'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { PluginOptionValues } from './plugin-options.js'

/**
 * The page window of a transport's collection reads, with the same option
 * and defaults on every transport (ADR-0309).
 *
 * @example `{ defaultTake: 20, maxTake: 200 }`
 */
export interface TransportPaginationOptions {
	/** Page size used when a collection read omits it. @default 100 */
	readonly defaultTake?: number
	/** Largest accepted page size. @default 1000 */
	readonly maxTake?: number
}

/**
 * The exposure options every transport factory shares (ADR-0347 decision 3).
 * A transport adds them to its own options interface and parses them with
 * {@link parseTransportExposureOptions}.
 *
 * @example `restPlugin({ default: { write: false }, hide: [readingTime] })`
 */
export interface TransportExposureOptions {
	/**
	 * Exposure of every schema method that `.with({ expose })` and the
	 * transport's own `.with` key leave undecided: `true`, `false`, or by
	 * native key. Plugin commands are named in `.with`, never here.
	 * @example `default: { write: false }`
	 */
	readonly default?: boolean | NativeExposureRules
	/**
	 * Public operations this transport does not expose; it exposes every other
	 * public operation it serves (ADR-0341).
	 * @example `hide: [readingTime]`
	 */
	readonly hide?: readonly PluginOperationDefinition[]
	/**
	 * Default and largest page size of collection reads (ADR-0309).
	 * @default { defaultTake: 100, maxTake: 1000 }
	 */
	readonly pagination?: TransportPaginationOptions
	/**
	 * Starts even when the transport exposes writes and no protected policy
	 * (such as Access) is installed: every client may then write (ADR-0294).
	 * @default false
	 */
	readonly publicWrites?: boolean
}

/** The shared exposure options after validation, frozen. */
export interface NormalizedTransportExposureOptions {
	/** `undefined` when the transport sets no `default`. */
	readonly default: NormalizedExposureRule | undefined
	readonly hide: readonly PluginOperationDefinition[]
	readonly pagination: Readonly<{ defaultTake: number; maxTake: number }>
	readonly publicWrites: boolean
}

/** Configures {@link parseTransportExposureOptions}. */
export interface TransportExposureParserOptions {
	/** Prefixes every message. @example 'REST plugin' */
	readonly name: string
	/** Largest page size the transport can represent, if any. @example 2_147_483_647 */
	readonly maximumTake?: number
}

/**
 * The keys of {@link TransportExposureOptions}, to spread into the `keys`
 * of a transport's `definePluginOptionsParser`.
 */
export const transportExposureOptionKeys: readonly [
	'default',
	'hide',
	'pagination',
	'publicWrites',
] = immutableArray(['default', 'hide', 'pagination', 'publicWrites'])

const defaultPagination = immutableRecord({ defaultTake: 100, maxTake: 1000 })

const readTake = (
	page: Readonly<Record<string, unknown>>,
	key: 'defaultTake' | 'maxTake',
	options: TransportExposureParserOptions,
): number => {
	const value = page[key]
	if (value === undefined) return defaultPagination[key]
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
		throw new TypeError(
			`${options.name} pagination.${key} must be a positive safe integer`,
		)
	}
	if (options.maximumTake !== undefined && value > options.maximumTake) {
		throw new TypeError(
			`${options.name} pagination.${key} must not exceed ${String(options.maximumTake)}`,
		)
	}
	return value
}

const parsePagination = (
	value: unknown,
	options: TransportExposureParserOptions,
): NormalizedTransportExposureOptions['pagination'] => {
	if (value === undefined) return defaultPagination
	if (!isPlainRecord(value)) {
		throw new TypeError(`${options.name} pagination must be a plain object`)
	}
	for (const key of Reflect.ownKeys(value)) {
		if (key !== 'defaultTake' && key !== 'maxTake') {
			throw new TypeError(
				`${options.name} pagination has an unknown option: ${String(key)}`,
			)
		}
	}
	const defaultTake = readTake(value, 'defaultTake', options)
	const maxTake = readTake(value, 'maxTake', options)
	if (defaultTake > maxTake) {
		throw new TypeError(
			`${options.name} pagination.defaultTake must not exceed pagination.maxTake`,
		)
	}
	return immutableRecord({ defaultTake, maxTake })
}

const parseHide = (
	value: unknown,
	name: string,
): readonly PluginOperationDefinition[] => {
	if (value === undefined) return immutableArray([])
	if (!isUnknownArray(value)) {
		throw new TypeError(`${name} hide must be an array`)
	}
	const names = new Set<string>()
	const operations: PluginOperationDefinition[] = []
	for (const [index, operation] of value.entries()) {
		if (!isPluginOperationDefinition(operation)) {
			throw new TypeError(
				`${name} hide[${String(index)}] must be an operation token`,
			)
		}
		if (names.has(operation.name)) {
			throw new TypeError(`${name} hide repeats ${operation.name}`)
		}
		names.add(operation.name)
		operations.push(operation)
	}
	return immutableArray(operations)
}

/**
 * Validates the shared exposure options of one transport factory, inside
 * its `definePluginOptionsParser` normalizer; `name` prefixes every message.
 *
 * @example
 * ```ts
 * const parseOptions = definePluginOptionsParser({
 *   name: 'REST plugin options',
 *   keys: [...transportExposureOptionKeys, 'basePath'] as const,
 *   normalize: ({ basePath, ...values }) => ({
 *     ...parseTransportExposureOptions(values, { name: 'REST plugin' }),
 *     basePath: normalizeBasePath(basePath),
 *   }),
 * })
 * ```
 */
export const parseTransportExposureOptions = (
	values: PluginOptionValues<typeof transportExposureOptionKeys>,
	options: TransportExposureParserOptions,
): NormalizedTransportExposureOptions => {
	const { name } = options
	const publicWrites = values.publicWrites ?? false
	if (typeof publicWrites !== 'boolean') {
		throw new TypeError(`${name} publicWrites must be a boolean`)
	}
	return immutableRecord({
		default:
			values.default === undefined
				? undefined
				: normalizeExposureRule(values.default, `${name} default`, {
						pluginKeys: false,
					}),
		hide: parseHide(values.hide, name),
		pagination: parsePagination(values.pagination, options),
		publicWrites,
	})
}

/** Configures {@link readExposurePlan}. */
export interface ReadExposurePlanOptions<
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
> {
	/** The protocol the transport serves. */
	readonly transport: TTransport
	/** The transport's own key of `.with({ … })`. @example 'rest' */
	readonly schemaKey: string
	/** The transport factory messages name. @example 'restPlugin' */
	readonly factory: string
	/** The transport name messages use. @example 'REST' */
	readonly label: string
	/** The output of {@link parseTransportExposureOptions}. */
	readonly options: NormalizedTransportExposureOptions
}

/**
 * Reads what one transport serves (ADR-0347): Core compiles the plan from
 * `expose`, the transport's own `.with` key and its parsed `default` and
 * `hide`, once per protocol.
 *
 * @example `readExposurePlan(planner, { transport, schemaKey: 'rest', factory: 'restPlugin', label: 'REST', options })`
 */
export const readExposurePlan = <
	const TTransport extends OperationTransportProtocol,
>(
	planner: ApplicationOperationTransportPlanner,
	{
		factory,
		label,
		options,
		schemaKey,
		transport,
	}: ReadExposurePlanOptions<TTransport>,
): ApplicationExposurePlan<TTransport> =>
	planner.planExposure({
		...(options.default === undefined ? {} : { default: options.default }),
		factory,
		hide: options.hide,
		label,
		schemaKey,
		transport,
	})

/** Configures {@link assertPublicWrites}. */
export interface PublicWritesCheckOptions {
	/** The transport name that starts the message. @example 'REST' */
	readonly label: string
	/** The plan's write methods. */
	readonly writes: readonly ExposedWriteMethod[]
	/** The executor's `hasProtectedPolicy()`. */
	readonly hasProtectedPolicy: boolean
	/** The transport's parsed `publicWrites` option. */
	readonly publicWrites: boolean
	/** Names one write in the transport's own terms. @example `({ schema, method }) => `${schema}.${method.entry.method}`` */
	readonly describe: (write: ExposedWriteMethod) => string
	/** The opt-in the message suggests. @example 'restPlugin({ publicWrites: true })' */
	readonly hint: string
}

/**
 * Refuses to start when a transport exposes writes and no protected policy
 * is installed, unless `publicWrites` opts in (ADR-0294). The message names
 * the first three writes.
 */
export const assertPublicWrites = (options: PublicWritesCheckOptions): void => {
	const { writes } = options
	if (options.publicWrites || writes.length === 0 || options.hasProtectedPolicy)
		return
	const described = writes
		.slice(0, 3)
		.map((write) => options.describe(write))
		.join(', ')
	throw new TypeError(
		`${options.label} exposes writes (${described}${writes.length > 3 ? ', …' : ''}) but no protected policy plugin is installed: install one, such as accessPlugin(), or pass ${options.hint} to let every client write.`,
	)
}
