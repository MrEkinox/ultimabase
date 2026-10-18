import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'

import { assertExactEnumerableKeys } from '../../exact-object-validation.js'
import type {
	NativeCommandCatalogEntry,
	PluginCommandCatalogEntry,
} from '../../plugins/command-catalog.js'
import {
	normalizeExposureRule,
	type NormalizedExposureRule,
} from '../../plugins/exposure-rules.js'
import {
	isPluginOperationDefinition,
	type PluginOperationDefinition,
} from '../../plugins/plugin-operations.js'
import { coreSchemaKeys } from '../../schema/schema/registry.js'
import { isOperationTransportProtocol } from '../plugin-operations/capabilities.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import type { ExposedOperationTransportBinding } from '../plugin-operations/transport.js'
import type { ExposedSchemaMutationTransportBinding } from '../schema-mutations/transport.js'

/**
 * Asks Core for one transport's exposure plan (ADR-0347): what it serves of
 * every application schema and public operation, from `expose`, the
 * transport's own `.with` key, its `default` and its `hide`.
 */
export interface ExposurePlanningOptions<
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
> {
	/** The protocol the transport serves. */
	readonly transport: TTransport
	/** The transport's own key of `.with({ … })`, defined by the calling plugin. @example 'rest' */
	readonly schemaKey: string
	/** The transport factory messages name. @example 'restPlugin' */
	readonly factory: string
	/** The transport name messages use. @example 'REST' */
	readonly label: string
	/** The transport's parsed `default` rule, applied after `expose`. */
	readonly default?: NormalizedExposureRule
	/** Public operations the transport leaves out. */
	readonly hide?: readonly PluginOperationDefinition[]
}

/** A native method a transport serves for one schema. */
export interface ExposedNativeSchemaMethod {
	readonly kind: 'native'
	readonly entry: NativeCommandCatalogEntry
}

/** A request plugin command on one row a transport serves for one schema. */
export interface ExposedPluginSchemaMethod {
	readonly kind: 'plugin'
	readonly entry: PluginCommandCatalogEntry
	/** The command's binding for the planned protocol. */
	readonly binding: ExposedSchemaMutationTransportBinding
}

/** One method a transport serves for one schema. */
export type ExposedSchemaMethod =
	ExposedNativeSchemaMethod | ExposedPluginSchemaMethod

/** The methods one transport serves for one application schema. */
export interface ExposedSchemaPlan {
	readonly className: string
	/** Native methods in transport order, then plugin commands by name. */
	readonly methods: readonly ExposedSchemaMethod[]
}

/** One exposed write, for the transport's `publicWrites` check. */
export interface ExposedWriteMethod {
	readonly schema: string
	readonly method: ExposedSchemaMethod
}

/** Everything one transport serves, compiled once per protocol (ADR-0347). */
export interface ApplicationExposurePlan<
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
> {
	readonly transport: TTransport
	/** Every application schema with at least one served method. */
	readonly schemas: readonly ExposedSchemaPlan[]
	/** The public operations the transport serves, after `hide`. */
	readonly operations: readonly ExposedOperationTransportBinding[]
	/** Every served write method, in schema then method order. */
	readonly writes: readonly ExposedWriteMethod[]
}

/** @internal Options after validation. */
export interface ParsedExposurePlanningOptions<
	TTransport extends OperationTransportProtocol,
> {
	readonly transport: TTransport
	readonly schemaKey: string
	readonly factory: string
	readonly label: string
	readonly default: NormalizedExposureRule | undefined
	readonly hide: readonly PluginOperationDefinition[]
}

const optionKeys = new Set([
	'default',
	'factory',
	'hide',
	'label',
	'schemaKey',
	'transport',
])

const parseHide = (
	value: unknown,
	label: string,
): readonly PluginOperationDefinition[] => {
	if (value === undefined) return []
	if (!isUnknownArray(value)) {
		throw new TypeError(`${label} plugin hide must be an array`)
	}
	const names = new Set<string>()
	return value.map((operation, index) => {
		if (!isPluginOperationDefinition(operation)) {
			throw new TypeError(
				`${label} plugin hide[${String(index)}] must be an operation token`,
			)
		}
		if (names.has(operation.name)) {
			throw new TypeError(`${label} plugin hide repeats ${operation.name}`)
		}
		names.add(operation.name)
		return operation
	})
}

/** @internal Validates the options of one planning request. */
export const parseExposurePlanningOptions = <
	TTransport extends OperationTransportProtocol,
>(
	options: ExposurePlanningOptions<TTransport>,
): ParsedExposurePlanningOptions<TTransport> => {
	if (
		!isPlainRecord(options) ||
		!isOperationTransportProtocol(options.transport) ||
		typeof options.schemaKey !== 'string' ||
		typeof options.factory !== 'string' ||
		typeof options.label !== 'string'
	) {
		throw new TypeError(
			'exposure planning requires a protocol, a schemaKey, a factory and a label',
		)
	}
	assertExactEnumerableKeys(
		options,
		optionKeys,
		'exposure planning contains unknown key: ',
	)
	const { factory, label, schemaKey, transport } = options
	if (coreSchemaKeys.has(schemaKey)) {
		throw new TypeError(
			`exposure planning schemaKey ${schemaKey} is reserved by Core`,
		)
	}
	return {
		default:
			options.default === undefined
				? undefined
				: normalizeExposureRule(options.default, `${label} plugin default`, {
						pluginKeys: false,
					}),
		factory,
		hide: parseHide(options.hide, label),
		label,
		schemaKey,
		transport,
	}
}

/** @internal Identifies equal options, whatever the order of their entries. */
export const exposurePlanningSignature = (
	options: ParsedExposurePlanningOptions<OperationTransportProtocol>,
): string =>
	JSON.stringify([
		options.schemaKey,
		options.factory,
		options.label,
		typeof options.default === 'object'
			? Object.entries(options.default).sort(([left], [right]) =>
					left < right ? -1 : left > right ? 1 : 0,
				)
			: (options.default ?? null),
		options.hide.map(({ name, version }) => `${name}@${version}`).sort(),
	])
