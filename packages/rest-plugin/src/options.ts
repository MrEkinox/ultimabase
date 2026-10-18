import type { PluginOperationDefinition } from '@ultimabase/core/plugin'
import {
	definePluginOptionsParser,
	parseTransportExposureOptions,
	transportExposureOptionKeys,
	type NormalizedTransportExposureOptions,
	type TransportExposureOptions,
	type TransportPaginationOptions,
} from '@ultimabase/plugin-kit'

import type { RestMethodRules } from './rules.js'

/** Configures one REST instance (ADR-0324, ADR-0347). */
export interface RestPluginOptions extends TransportExposureOptions {
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
	 * Exposure of every schema method that `.with({ rest })` and
	 * `.with({ expose })` leave out: `true`, `false`, or by `all`, group,
	 * operation or method. Plugin commands are named in `.with`, never here.
	 * @example `default: { write: false }`
	 */
	readonly default?: boolean | RestMethodRules
	/**
	 * Public operations this instance does not expose; every other public
	 * operation REST serves is exposed: those whose owner binds them to REST
	 * or to no transport (ADR-0341).
	 * @example `hide: [readingTime]`
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
export interface RestPaginationOptions extends TransportPaginationOptions {
	/** `take` used when a collection read omits it. @default 100 */
	readonly defaultTake?: number
	/** Largest accepted `take`; a larger one is `REST_READ_INVALID_INPUT`. @default 1000 */
	readonly maxTake?: number
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

const normalizeBodyLimit = (value: unknown): number | undefined => {
	if (value === undefined) return undefined
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
		throw new TypeError('REST plugin bodyLimit must be a positive safe integer')
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
	/** `default`, `hide`, `pagination` and `publicWrites`, parsed by Plugin Kit. */
	readonly exposure: NormalizedTransportExposureOptions
	readonly instanceId: string | undefined
	readonly openapi: boolean
}

/** @internal Rejects unknown keys and normalizes every plugin factory option. */
export const parseRestPluginOptions: (
	options: RestPluginOptions,
) => NormalizedRestPluginOptions = definePluginOptionsParser({
	name: 'REST plugin options',
	keys: [
		...transportExposureOptionKeys,
		'basePath',
		'bodyLimit',
		'instanceId',
		'openapi',
	] as const,
	normalize: ({ basePath, bodyLimit, instanceId, openapi, ...exposure }) => {
		if (
			instanceId !== undefined &&
			(typeof instanceId !== 'string' || instanceId.length === 0)
		) {
			throw new TypeError('REST plugin instanceId must be a non-empty string')
		}
		return {
			basePath: normalizeBasePath(basePath),
			bodyLimit: normalizeBodyLimit(bodyLimit),
			// REST represents any safe page size: no pagination maximum.
			exposure: parseTransportExposureOptions(exposure, {
				name: 'REST plugin',
			}),
			instanceId,
			openapi: normalizeBoolean(openapi, 'openapi'),
		}
	},
})
