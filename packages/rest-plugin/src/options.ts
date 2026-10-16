import {
	isPluginOperationDefinition,
	type PluginOperationDefinition,
} from '@ultimabase/core/plugin'
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import {
	immutableArray,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { defaultRestReadLimits } from './reads.js'
import {
	normalizeRule,
	type NormalizedRestRule,
	type RestMethodRules,
} from './rules.js'

/** Configures one REST instance (ADR-0324). */
export interface RestPluginOptions {
	/**
	 * Absolute prefix of every REST route; it carries no protocol version
	 * (the `X-UltimaBase-Rest-Version` response header does).
	 * @default "/api"
	 * @example `basePath: '/api/v1'` to version the application's own API
	 */
	readonly basePath?: string
	/**
	 * Maximum streamed JSON request size in bytes, replacing
	 * `httpPlugin({ bodyLimit })` for REST routes. @default the HTTP plugin's bodyLimit
	 */
	readonly bodyLimit?: number
	/**
	 * Exposure inherited by every schema method a `.with({ rest: … })` rule
	 * leaves out: `true`, `false`, or per method.
	 * @example `default: { createOne: false, updateOne: false, deleteOne: false }`
	 */
	readonly default?: boolean | RestMethodRules
	/**
	 * Public operations this instance does not expose; every other operation
	 * its owner declared public is exposed.
	 * @example `hide: [authOperations.refresh]`
	 */
	readonly hide?: readonly PluginOperationDefinition[]
	/** Distinguishes two explicit REST configurations in one application. */
	readonly instanceId?: string
	/**
	 * Serves the OpenAPI 3.1 description of the exposed routes at
	 * `{basePath}/openapi.json`.
	 * @default false
	 */
	readonly openapi?: boolean
	/**
	 * Default and largest collection `take`, as GraphQL `first` (ADR-0309).
	 *
	 * @default { defaultTake: 100, maxTake: 1000 }
	 * @example `restPlugin({ pagination: { defaultTake: 20, maxTake: 200 } })`
	 */
	readonly pagination?: RestPaginationOptions
	/**
	 * Starts even when REST exposes writes and no protected policy (such as
	 * Access) is installed: every client may then write (ADR-0294).
	 * @default false
	 */
	readonly publicWrites?: boolean
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

/** @internal Validates the public operation tokens one REST instance hides. */
const normalizeRestHide = (
	value: unknown,
): readonly PluginOperationDefinition[] => {
	if (value === undefined) return immutableArray([])
	if (!isUnknownArray(value)) {
		throw new TypeError('REST plugin hide must be an array')
	}
	const names = new Set<string>()
	const operations: PluginOperationDefinition[] = []
	for (const [index, operation] of value.entries()) {
		if (!isPluginOperationDefinition(operation)) {
			throw new TypeError(
				`REST plugin hide[${String(index)}] must be an operation token`,
			)
		}
		if (names.has(operation.name)) {
			throw new TypeError(`REST plugin hide repeats ${operation.name}`)
		}
		names.add(operation.name)
		operations.push(operation)
	}
	return immutableArray(operations)
}

const normalizeBasePath = (value: unknown): string => {
	if (value === undefined) return '/api'
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
		if (decoded === '.' || decoded === '..') {
			throw new TypeError('REST plugin basePath cannot contain dot segments')
		}
	}
	return value
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

const normalizeBoolean = (value: unknown, name: string): boolean => {
	if (value === undefined) return false
	if (typeof value !== 'boolean') {
		throw new TypeError(`REST plugin ${name} must be a boolean`)
	}
	return value
}

/** @internal The validated configuration one `restPlugin()` call closes over. */
export interface NormalizedRestPluginOptions {
	/** The mount path; `/` mounts REST at the root. */
	readonly basePath: string
	/** `undefined` inherits the HTTP plugin's limit (ADR-0323). */
	readonly bodyLimit: number | undefined
	readonly defaultRule: NormalizedRestRule | undefined
	readonly hide: readonly PluginOperationDefinition[]
	readonly instanceId: string | undefined
	readonly openapi: boolean
	readonly pagination: Readonly<{ defaultTake: number; maxTake: number }>
	readonly publicWrites: boolean
}

/** @internal Rejects unknown keys and normalizes every plugin factory option. */
export const parseRestPluginOptions: (
	options: RestPluginOptions,
) => NormalizedRestPluginOptions = definePluginOptionsParser({
	name: 'REST plugin options',
	keys: [
		'basePath',
		'bodyLimit',
		'default',
		'hide',
		'instanceId',
		'openapi',
		'pagination',
		'publicWrites',
	] as const,
	normalize: ({
		basePath,
		bodyLimit,
		default: defaultRule,
		hide,
		instanceId,
		openapi,
		pagination,
		publicWrites,
	}) => {
		if (
			instanceId !== undefined &&
			(typeof instanceId !== 'string' || instanceId.length === 0)
		) {
			throw new TypeError('REST plugin instanceId must be a non-empty string')
		}
		return {
			basePath: normalizeBasePath(basePath),
			bodyLimit:
				bodyLimit === undefined
					? undefined
					: normalizePositiveSafeInteger(
							bodyLimit,
							'bodyLimit',
							defaultRestReadLimits.bodyBytes,
						),
			defaultRule:
				defaultRule === undefined
					? undefined
					: normalizeRule(defaultRule, 'REST plugin default', false),
			hide: normalizeRestHide(hide),
			instanceId,
			openapi: normalizeBoolean(openapi, 'openapi'),
			pagination: normalizeRestPagination(pagination),
			publicWrites: normalizeBoolean(publicWrites, 'publicWrites'),
		}
	},
})
