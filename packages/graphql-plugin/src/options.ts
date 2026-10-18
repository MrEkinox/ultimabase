import type { PluginOperationDefinition } from '@ultimabase/core/plugin'
import {
	definePluginOptionsParser,
	parseTransportExposureOptions,
	transportExposureOptionKeys,
	type NormalizedTransportExposureOptions,
	type TransportExposureOptions,
} from '@ultimabase/plugin-kit'
import { immutableArray, isUnknownArray } from '@ultimabase/shared'
import { GraphQLSchema } from 'graphql'

import {
	normalizeGraphqlExecutionLimits,
	type GraphqlExecutionLimits,
	type GraphqlPaginationOptions,
	type NormalizedGraphqlExecutionLimits,
} from './connection-limits.js'
import type { GraphqlMethodRules } from './rules.js'

/** Configures deterministic GraphQL v1 schema generation (ADR-0325, ADR-0347). */
export interface GraphqlPluginOptions extends TransportExposureOptions {
	/**
	 * Exposure of every schema method that `.with({ graphql })` and
	 * `.with({ expose })` leave out: `true`, `false`, or by `all`, group,
	 * operation or method. Plugin commands are named in `.with`, never here.
	 * @example `default: { write: false }`
	 */
	readonly default?: boolean | GraphqlMethodRules
	/**
	 * Public operations this schema does not expose; every other public
	 * operation GraphQL serves is exposed: those whose owner binds them to
	 * GraphQL or to no transport (ADR-0341).
	 * @example `hide: [authOperations.refresh]`
	 */
	readonly hide?: readonly PluginOperationDefinition[]
	/** Bounds document size, depth, aliases, root fields and variables. */
	readonly limits?: GraphqlExecutionLimits
	/**
	 * Default and largest Relay `first`, as REST `take` (ADR-0309).
	 *
	 * @default { defaultTake: 100, maxTake: 1000 }
	 * @example `graphqlPlugin({ pagination: { defaultTake: 20, maxTake: 200 } })`
	 */
	readonly pagination?: GraphqlPaginationOptions
	/**
	 * Starts even when GraphQL exposes writes and no protected policy (such as
	 * Access) is installed: every client may then write (ADR-0294).
	 * @default false
	 */
	readonly publicWrites?: boolean
	/** Adds completed application-owned schemas after the generated surface. */
	readonly schemas?: readonly GraphQLSchema[]
	/**
	 * Writes the schema SDL to this file at startup, for graphql-codegen or
	 * gql.tada; a relative path resolves from the working directory.
	 * @example `sdl: './schema.graphql'`
	 */
	readonly sdl?: string
}

const normalizeCustomSchemas = (value: unknown): readonly GraphQLSchema[] => {
	if (value === undefined) return immutableArray([])
	if (!isUnknownArray(value)) {
		throw new TypeError('GraphQL plugin schemas must be an array')
	}
	const schemas: GraphQLSchema[] = []
	for (const [index, schema] of value.entries()) {
		if (!(schema instanceof GraphQLSchema)) {
			throw new TypeError(
				`GraphQL plugin schemas[${String(index)}] must be a completed GraphQLSchema`,
			)
		}
		schemas.push(schema)
	}
	return immutableArray(schemas)
}

const normalizeSdlPath = (value: unknown): string | undefined => {
	if (value === undefined) return undefined
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError('GraphQL plugin sdl must be a non-empty file path')
	}
	return value
}

/** @internal The validated configuration one `graphqlPlugin()` call closes over. */
export interface NormalizedGraphqlPluginOptions {
	/** `default`, `hide`, `pagination` and `publicWrites`, parsed by Plugin Kit. */
	readonly exposure: NormalizedTransportExposureOptions
	readonly limits: NormalizedGraphqlExecutionLimits
	readonly schemas: readonly GraphQLSchema[]
	readonly sdl: string | undefined
}

/** @internal Rejects unknown keys and normalizes every plugin factory option. */
export const parseGraphqlPluginOptions: (
	options: GraphqlPluginOptions,
) => NormalizedGraphqlPluginOptions = definePluginOptionsParser({
	name: 'GraphQL plugin options',
	keys: [...transportExposureOptionKeys, 'limits', 'schemas', 'sdl'] as const,
	normalize: ({ limits, schemas, sdl, ...values }) => {
		// The page window is shared; GraphQL adds the Int range of `first`.
		const exposure = parseTransportExposureOptions(values, {
			name: 'GraphQL plugin',
		})
		return {
			exposure,
			limits: normalizeGraphqlExecutionLimits(limits, exposure.pagination),
			schemas: normalizeCustomSchemas(schemas),
			sdl: normalizeSdlPath(sdl),
		}
	},
})
