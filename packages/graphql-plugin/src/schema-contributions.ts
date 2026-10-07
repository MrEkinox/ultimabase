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

import { assertGraphqlKnownKeys } from './options.js'

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

// A factory may return one schema or a list; each must already be completed.
const readSchemas = (created: unknown): readonly GraphQLSchema[] =>
	immutableArray(
		(isUnknownArray(created) ? created : [created]).map((schema, index) => {
			if (!(schema instanceof GraphQLSchema)) {
				throw new TypeError(
					`GraphQL schema contribution[${String(index)}] must be a completed GraphQLSchema`,
				)
			}
			return schema
		}),
	)

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
	assertGraphqlKnownKeys(
		untrusted,
		providerOptionKeys,
		'GraphQL schema provider options',
	)
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
			return immutableRecord({ value: readSchemas(created) })
		},
	})
}
