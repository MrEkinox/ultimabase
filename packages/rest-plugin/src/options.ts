import {
	defineSchemaOption,
	isPluginOperationDefinition,
	type PluginOperationDefinition,
	type SchemaDefinition,
	type SchemaOptionDefinition,
} from '@ultimabase/core'
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { defaultRestReadLimits } from './reads.js'

/** Selects the itemized bulk REST routes generated for one schema. */
export interface RestBulkRoutes {
	/** Generates `POST /bulk/create`. */
	readonly create?: boolean
	/** Generates `POST /bulk/update`. */
	readonly update?: boolean
	/** Generates `POST /bulk/delete`. */
	readonly delete?: boolean
	/** Generates `POST /bulk/upsert`. */
	readonly upsert?: boolean
}

/** Selects the REST v1 routes generated for one application-owned schema. */
export interface RestSchemaRoutes {
	/** Generates the simple GET and complex POST collection queries. */
	readonly find?: boolean
	/** Generates the UUID-v7 item read route. */
	readonly get?: boolean
	/** Generates the GET and POST first-item routes. */
	readonly first?: boolean
	/** Generates the GET and POST count routes. */
	readonly count?: boolean
	/** Generates the GET and POST existence routes. */
	readonly exists?: boolean
	/** Generates the collection create route. */
	readonly create?: boolean
	/** Generates the UUID-v7 item update route. */
	readonly update?: boolean
	/** Generates the UUID-v7 item delete route. */
	readonly delete?: boolean
	/** Generates the explicit unique-predicate upsert route. */
	readonly upsert?: boolean
	/** Selects homogeneous, ordered, atomic itemized bulk routes. */
	readonly bulk?: boolean | RestBulkRoutes
	/** Generates explicitly bound plugin-owned schema mutation routes. */
	readonly mutations?: boolean
}

export type RestSchemaRoutesOption = boolean | RestSchemaRoutes

const schemaRouteKeys = new Set([
	'bulk',
	'count',
	'create',
	'delete',
	'exists',
	'find',
	'first',
	'get',
	'mutations',
	'update',
	'upsert',
])
const bulkRouteKeys = new Set(['create', 'delete', 'update', 'upsert'])

const assertBoolean = (value: unknown, path: string): boolean => {
	if (typeof value !== 'boolean') {
		throw new TypeError(`${path} must be a boolean`)
	}
	return value
}

// Copies one sparse selection; omitted keys keep inheriting their defaults.
const normalizeSelection = (
	value: unknown,
	path: string,
	keys: ReadonlySet<string>,
): Readonly<Record<string, boolean | RestBulkRoutes>> => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a boolean or plain object`)
	}
	const normalized: Record<string, boolean | RestBulkRoutes> = {}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !keys.has(key)) {
			throw new TypeError(`${path} contains unknown option: ${String(key)}`)
		}
		const option = value[key]
		normalized[key] =
			key === 'bulk' && typeof option !== 'boolean'
				? normalizeSelection(option, `${path}.bulk`, bulkRouteKeys)
				: assertBoolean(option, `${path}.${key}`)
	}
	return immutableRecord(normalized)
}

/** Normalizes a sparse route selection while preserving inheritance by omission. */
export const normalizeRestSchemaRoutes = (
	value: unknown,
	path: string,
): RestSchemaRoutesOption =>
	typeof value === 'boolean'
		? value
		: normalizeSelection(value, path, schemaRouteKeys)

/** Owns the direct application schema `rest` route-selection option. */
export const restSchemaOption: SchemaOptionDefinition<RestSchemaRoutesOption> =
	defineSchemaOption({
		normalize: normalizeRestSchemaRoutes,
		protocolVersion: 1,
		typegen: {
			module: '@ultimabase/rest-plugin',
			type: 'RestSchemaRoutesOption',
		},
	})

/** Reads the normalized direct option without treating omission as a denial. */
export const readRestSchemaRoutes = (
	schema: SchemaDefinition,
): RestSchemaRoutesOption | undefined =>
	Object.hasOwn(schema.definition, 'rest')
		? (Reflect.get(schema.definition, 'rest') as
				RestSchemaRoutesOption | undefined)
		: undefined

/** Configures immutable REST v1 schema-route generation. */
export interface RestPluginOptions {
	/** Accepts Core's inability to prove complete public policy coverage. */
	readonly acknowledgeUnverifiedProtection?: true
	/** Absolute normalized prefix; REST always appends `/v1`. @default "/api" */
	readonly basePath?: string
	/** Maximum streamed JSON request size in bytes. @default 1048576 */
	readonly bodyLimit?: number
	/** Supplies sparse route defaults inherited by application schemas. */
	readonly default?: RestSchemaRoutesOption
	/** Distinguishes two explicit REST configurations in one application. */
	readonly instanceId?: string
	/** Explicitly exposes these exact application operation tokens through REST. */
	readonly operations?: readonly PluginOperationDefinition[]
	/**
	 * Default and largest collection `take`, as GraphQL `first` (ADR-0309).
	 *
	 * @default { defaultTake: 100, maxTake: 1000 }
	 * @example `restPlugin({ pagination: { defaultTake: 20, maxTake: 200 } })`
	 */
	readonly pagination?: RestPaginationOptions
}

/**
 * Configures the collection page window, with the same option and defaults
 * as `graphqlPlugin({ pagination })` (ADR-0309).
 *
 * @example `restPlugin({ pagination: { defaultTake: 20, maxTake: 200 } })`
 */
export interface RestPaginationOptions {
	/** `take` used when a collection read omits it. @default 100 */
	readonly defaultTake?: number
	/** Largest accepted `take`; a larger one is `REST_READ_INVALID_INPUT`. @default 1000 */
	readonly maxTake?: number
}

/** @internal Validates the page window shared by every REST collection read. */
const normalizeRestPagination = (
	value: unknown,
): Readonly<{ defaultTake: number; maxTake: number }> => {
	if (value === undefined) {
		return {
			defaultTake: defaultRestReadLimits.defaultTake,
			maxTake: defaultRestReadLimits.maxTake,
		}
	}
	if (!isPlainRecord(value)) {
		throw new TypeError('REST plugin pagination must be a plain object')
	}
	for (const key of Object.keys(value)) {
		if (key !== 'defaultTake' && key !== 'maxTake') {
			throw new TypeError(
				`REST plugin pagination has an unknown option: ${key}`,
			)
		}
	}
	const defaultTake = normalizePositiveSafeInteger(
		value.defaultTake,
		'pagination.defaultTake',
		defaultRestReadLimits.defaultTake,
	)
	const maxTake = normalizePositiveSafeInteger(
		value.maxTake,
		'pagination.maxTake',
		defaultRestReadLimits.maxTake,
	)
	if (defaultTake > maxTake) {
		throw new TypeError(
			'REST plugin pagination.defaultTake must not exceed pagination.maxTake',
		)
	}
	return { defaultTake, maxTake }
}

/** @internal Validates the exact operation tokens exposed by one REST instance. */
const normalizeRestOperations = (
	value: unknown,
): readonly PluginOperationDefinition[] => {
	if (value === undefined) return immutableArray([])
	if (!isUnknownArray(value)) {
		throw new TypeError('REST plugin operations must be an array')
	}
	const names = new Set<string>()
	const operations: PluginOperationDefinition[] = []
	for (const [index, operation] of value.entries()) {
		if (!isPluginOperationDefinition(operation)) {
			throw new TypeError(
				`REST plugin operations[${String(index)}] must be an operation token`,
			)
		}
		if (names.has(operation.name)) {
			throw new TypeError(`REST plugin operations repeats ${operation.name}`)
		}
		names.add(operation.name)
		operations.push(operation)
	}
	return immutableArray(operations)
}

interface NormalizedRestBasePath {
	readonly basePath: string
	readonly mountPath: string
}

const normalizeBasePath = (value: unknown): NormalizedRestBasePath => {
	if (value === undefined) return { basePath: '/api/v1', mountPath: '/api' }
	if (typeof value !== 'string' || !value.startsWith('/')) {
		throw new TypeError('REST plugin basePath must be an absolute path')
	}
	if (value.includes('?') || value.includes('#')) {
		throw new TypeError(
			'REST plugin basePath cannot contain a query or fragment',
		)
	}
	if (value.length > 1 && value.endsWith('/')) {
		throw new TypeError('REST plugin basePath cannot have a trailing slash')
	}
	const segments = value === '/' ? [] : value.slice(1).split('/')
	if (segments.some((segment) => segment.length === 0)) {
		throw new TypeError('REST plugin basePath must not contain empty segments')
	}
	for (const segment of segments) {
		let decoded: string
		try {
			decoded = decodeURIComponent(segment)
		} catch {
			throw new TypeError('REST plugin basePath contains invalid encoding')
		}
		if (decoded === '.' || decoded === '..' || decoded === 'v1') {
			throw new TypeError(
				'REST plugin basePath cannot contain dot or protocol-version segments',
			)
		}
	}
	return {
		basePath: value === '/' ? '/v1' : `${value}/v1`,
		mountPath: value,
	}
}

const normalizePositiveSafeInteger = (
	value: unknown,
	name: string,
	fallback: number,
): number => {
	if (value === undefined) return fallback
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
		throw new TypeError(`REST plugin ${name} must be a positive safe integer`)
	}
	return value
}

/** @internal The validated configuration one `restPlugin()` call closes over. */
export interface NormalizedRestPluginOptions {
	readonly acknowledgeUnverifiedProtection: true | undefined
	readonly basePath: string
	readonly bodyLimit: number
	readonly defaultRoutes: RestSchemaRoutesOption | undefined
	readonly instanceId: string | undefined
	readonly mountPath: string
	readonly operations: readonly PluginOperationDefinition[]
	readonly pagination: Readonly<{ defaultTake: number; maxTake: number }>
}

/** @internal Rejects unknown keys and normalizes every plugin factory option. */
export const parseRestPluginOptions: (
	options: RestPluginOptions,
) => NormalizedRestPluginOptions = definePluginOptionsParser({
	name: 'REST plugin options',
	keys: [
		'acknowledgeUnverifiedProtection',
		'basePath',
		'bodyLimit',
		'default',
		'instanceId',
		'operations',
		'pagination',
	] as const,
	normalize: ({
		acknowledgeUnverifiedProtection,
		basePath,
		bodyLimit,
		default: defaultRoutes,
		instanceId,
		operations,
		pagination,
	}) => {
		const paths = normalizeBasePath(basePath)
		if (
			acknowledgeUnverifiedProtection !== undefined &&
			acknowledgeUnverifiedProtection !== true
		) {
			throw new TypeError(
				'REST plugin acknowledgeUnverifiedProtection must be true when provided',
			)
		}
		if (
			instanceId !== undefined &&
			(typeof instanceId !== 'string' || instanceId.length === 0)
		) {
			throw new TypeError('REST plugin instanceId must be a non-empty string')
		}
		return {
			acknowledgeUnverifiedProtection,
			...paths,
			bodyLimit: normalizePositiveSafeInteger(
				bodyLimit,
				'bodyLimit',
				defaultRestReadLimits.bodyBytes,
			),
			defaultRoutes:
				defaultRoutes === undefined
					? undefined
					: normalizeRestSchemaRoutes(defaultRoutes, 'REST plugin default'),
			instanceId,
			operations: normalizeRestOperations(operations),
			pagination: normalizeRestPagination(pagination),
		}
	},
})
