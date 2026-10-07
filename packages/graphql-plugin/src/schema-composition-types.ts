import type {
	ApplicationCallbackExecutor,
	PluginIdentity,
	SchemaContributionOwner,
} from '@ultimabase/core'
import type { GraphQLSchema } from 'graphql'

/** @internal Identifies one completed schema and its callback authority. */
export interface OwnedGraphqlSchema {
	readonly attribution:
		| Readonly<{ readonly kind: 'application' }>
		| Readonly<{
				readonly kind: 'generated' | 'plugin'
				readonly owner: PluginIdentity
				readonly pluginVersion: string
		  }>
	readonly description: string
	readonly schema: GraphQLSchema
}

/** @internal Supplies trusted attribution while cloning contributed callbacks. */
export interface GraphqlSchemaCompositionContext {
	readonly callbacks: ApplicationCallbackExecutor
	readonly schemas: readonly OwnedGraphqlSchema[]
}

export const contributionOwner = (
	entry: OwnedGraphqlSchema,
): SchemaContributionOwner | undefined =>
	entry.attribution.kind !== 'application'
		? {
				kind: 'plugin',
				pluginId: entry.attribution.owner.pluginId,
				version: entry.attribution.pluginVersion,
				...(entry.attribution.owner.instanceId === undefined
					? {}
					: { instanceId: entry.attribution.owner.instanceId }),
			}
		: { kind: 'application' }
