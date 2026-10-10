import { defineCapability, type CapabilityToken } from '@ultimabase/core'
import {
	normalizeGraphqlHttpEndpoint,
	type GraphqlHttpEndpoint,
} from './endpoint.js'

export type { GraphqlHttpEndpoint } from './endpoint.js'

/** Lets exactly one HTTP adapter publish its selected GraphQL path. */
export type GraphqlHttpEndpointCapability = CapabilityToken<
	GraphqlHttpEndpoint,
	GraphqlHttpEndpoint,
	'ultimabase.graphql.http-endpoint',
	'1.0.0',
	'single',
	'application'
>

export const graphqlHttpEndpointCapability: GraphqlHttpEndpointCapability =
	defineCapability<GraphqlHttpEndpoint>()({
		capabilityId: 'ultimabase.graphql.http-endpoint',
		version: '1.0.0',
		cardinality: 'single',
		lifetime: 'application',
		hint: 'Install a GraphQL HTTP transport such as @ultimabase/graphql-yoga-plugin and add graphqlYogaPlugin() to UltimaBase.use(...).',
		compose: ([endpoint]) => normalizeGraphqlHttpEndpoint(endpoint),
	})
