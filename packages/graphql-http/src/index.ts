import { defineCapability, type CapabilityToken } from '@ultimabase/core/plugin'
import { immutableRecord } from '@ultimabase/shared'
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

/** Announces that the GraphQL HTTP endpoint answers introspection queries. */
export interface GraphqlIntrospection {
	/** Path of the endpoint that answers introspection. */
	readonly path: string
}

/** Lets one HTTP adapter announce introspection, which explorers require. */
export type GraphqlIntrospectionCapability = CapabilityToken<
	GraphqlIntrospection,
	GraphqlIntrospection,
	'ultimabase.graphql.introspection',
	'1.0.0',
	'single',
	'application'
>

/**
 * Published by the GraphQL HTTP adapter only while introspection is enabled;
 * an explorer served without it refuses to start (ADR-0312).
 */
export const graphqlIntrospectionCapability: GraphqlIntrospectionCapability =
	defineCapability<GraphqlIntrospection>()({
		capabilityId: 'ultimabase.graphql.introspection',
		version: '1.0.0',
		cardinality: 'single',
		lifetime: 'application',
		hint: 'Enable introspection, for example graphqlYogaPlugin({ introspection: true }), or stop serving the explorer in this environment.',
		compose: ([introspection]) => {
			const path = normalizeGraphqlHttpEndpoint(introspection).path
			return immutableRecord({ path })
		},
	})
