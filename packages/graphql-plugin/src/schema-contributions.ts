import {
	defineCapability,
	provideCapability,
	type ApplicationCapabilityFactoryContext,
	type CapabilityProviderDeclaration,
	type CapabilityToken,
	type CompiledSchemaRegistry,
	type PluginCapabilityReader,
} from '@ultimabase/core'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'
import { GraphQLSchema } from 'graphql'

/** Composes completed GraphQL schemas in plugin graph and registration order. */
export type GraphqlSchemaContributionsCapability = CapabilityToken<
	readonly GraphQLSchema[],
	readonly GraphQLSchema[],
	'ultimabase.graphql.schemas',
	'1.0.0',
	'multiple',
	'application'
>

export const graphqlSchemaContributionsCapability: GraphqlSchemaContributionsCapability =
	defineCapability<readonly GraphQLSchema[], readonly GraphQLSchema[]>()({
		capabilityId: 'ultimabase.graphql.schemas',
		version: '1.0.0',
		cardinality: 'multiple',
		lifetime: 'application',
		providerPrivilege: 'transport:expose',
		compose: (providers) => immutableArray(providers.flat()),
	})

/** Supplies schema factories with declared capabilities and compiled schemas only. */
export interface GraphqlSchemaContributionFactoryContext {
	readonly capabilities: PluginCapabilityReader<'materialization'>
	readonly schemas: CompiledSchemaRegistry
}

export type GraphqlSchemaContributionFactory = (
	context: GraphqlSchemaContributionFactoryContext,
) => MaybePromise<GraphQLSchema | readonly GraphQLSchema[]>

/** Configures one owner-attributed group of completed GraphQL schemas. */
export interface ProvideGraphqlSchemasOptions {
	readonly contributionId: string
	readonly create: GraphqlSchemaContributionFactory
}

const providerOptionKeys = new Set(['contributionId', 'create'])

const assertSchemas: (
	value: unknown,
	path: string,
) => asserts value is readonly GraphQLSchema[] = (value, path) => {
	if (!isUnknownArray(value)) throw new TypeError(`${path} must be an array`)
	for (const [index, schema] of value.entries()) {
		if (!(schema instanceof GraphQLSchema)) {
			throw new TypeError(
				`${path}[${String(index)}] must be a completed GraphQLSchema`,
			)
		}
	}
}

/** Provides completed schemas without registering a generic Core extension. */
export const provideGraphqlSchemas = (
	options: ProvideGraphqlSchemasOptions,
): CapabilityProviderDeclaration<
	typeof graphqlSchemaContributionsCapability
> => {
	const untrusted: unknown = options
	if (!isPlainRecord(untrusted)) {
		throw new TypeError(
			'GraphQL schema provider options must be a plain object',
		)
	}
	for (const key of Reflect.ownKeys(untrusted)) {
		if (typeof key !== 'string' || !providerOptionKeys.has(key)) {
			throw new TypeError(
				`GraphQL schema provider options contains unknown option: ${String(key)}`,
			)
		}
	}
	assertNonEmptyString(options.contributionId, 'GraphQL schema contributionId')
	if (typeof options.create !== 'function') {
		throw new TypeError('GraphQL schema provider create must be a function')
	}

	return provideCapability(graphqlSchemaContributionsCapability, {
		contributionId: options.contributionId,
		create: async (
			context: ApplicationCapabilityFactoryContext,
		): Promise<Readonly<{ readonly value: readonly GraphQLSchema[] }>> => {
			const created = await options.create({
				capabilities: context.capabilities,
				schemas: context.schemas,
			})
			const schemas = isUnknownArray(created) ? created : [created]
			assertSchemas(schemas, 'GraphQL schema contribution')
			return immutableRecord({ value: immutableArray(schemas) })
		},
	})
}
