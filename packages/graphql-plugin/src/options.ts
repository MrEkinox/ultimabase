import {
	isPluginOperationDefinition,
	type PluginOperationDefinition,
} from '@ultimabase/core/plugin'
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import { immutableArray, isUnknownArray } from '@ultimabase/shared'
import { GraphQLSchema } from 'graphql'

import {
	defaultGraphqlExecutionLimits,
	normalizeGraphqlExecutionLimits,
	type GraphqlExecutionLimits,
	type GraphqlPaginationOptions,
	type NormalizedGraphqlExecutionLimits,
} from './connection-limits.js'
import {
	normalizeGraphqlRule,
	type GraphqlMethodRules,
	type NormalizedGraphqlRule,
} from './rules.js'

/** Configures deterministic GraphQL v1 schema generation (ADR-0325). */
export interface GraphqlPluginOptions {
	/**
	 * Exposure inherited by every schema method a `plugins.graphql(…)` rule
	 * leaves out: `true`, `false`, or per method.
	 * @example `default: { createOne: false, updateOne: false, deleteOne: false }`
	 */
	readonly default?: boolean | GraphqlMethodRules
	/**
	 * Public operations this schema does not expose; every other operation
	 * its owner declared public is exposed.
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

/** @internal Validates the public operation tokens GraphQL hides. */
const normalizeGraphqlHide = (
	value: unknown,
): readonly PluginOperationDefinition[] => {
	if (value === undefined) return immutableArray([])
	if (!isUnknownArray(value)) {
		throw new TypeError('GraphQL plugin hide must be an array')
	}
	const names = new Set<string>()
	const operations: PluginOperationDefinition[] = []
	for (const [index, operation] of value.entries()) {
		if (!isPluginOperationDefinition(operation)) {
			throw new TypeError(
				`GraphQL plugin hide[${String(index)}] must be an operation token`,
			)
		}
		if (names.has(operation.name)) {
			throw new TypeError(`GraphQL plugin hide repeats ${operation.name}`)
		}
		names.add(operation.name)
		operations.push(operation)
	}
	return immutableArray(operations)
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
	readonly defaultRule: NormalizedGraphqlRule | undefined
	readonly hide: readonly PluginOperationDefinition[]
	readonly limits: NormalizedGraphqlExecutionLimits
	readonly publicWrites: boolean
	readonly schemas: readonly GraphQLSchema[]
	readonly sdl: string | undefined
}

/** @internal Rejects unknown keys and normalizes every plugin factory option. */
export const parseGraphqlPluginOptions: (
	options: GraphqlPluginOptions,
) => NormalizedGraphqlPluginOptions = definePluginOptionsParser({
	name: 'GraphQL plugin options',
	keys: [
		'default',
		'hide',
		'limits',
		'pagination',
		'publicWrites',
		'schemas',
		'sdl',
	] as const,
	normalize: (options) => {
		const { publicWrites } = options
		if (publicWrites !== undefined && typeof publicWrites !== 'boolean') {
			throw new TypeError('GraphQL plugin publicWrites must be a boolean')
		}
		return {
			defaultRule:
				options.default === undefined
					? undefined
					: normalizeGraphqlRule(
							options.default,
							'GraphQL plugin default',
							false,
						),
			hide: normalizeGraphqlHide(options.hide),
			limits:
				options.limits === undefined && options.pagination === undefined
					? defaultGraphqlExecutionLimits
					: normalizeGraphqlExecutionLimits(options.limits, options.pagination),
			publicWrites: publicWrites ?? false,
			schemas: normalizeCustomSchemas(options.schemas),
			sdl: normalizeSdlPath(options.sdl),
		}
	},
})
