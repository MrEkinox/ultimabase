import {
	defineOperationTransport,
	defineSchemaMutation,
	provideSchemaMutationHandler,
	provideSchemaMutationTransportBinding,
	schemaMutationHandler,
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
	type CapabilityProviderDeclaration,
	type PluginSchemaMutationDefinition,
	type pluginSchemaMutationHandlerCapability,
} from '@ultimabase/core'

import { softDeleteNoInput } from './contracts.js'
import { softDeleteTombstoneFieldName } from './visibility.js'

/** @internal Defines the one logical command shared by every explicit schema. */
export const softDeleteMutation: PluginSchemaMutationDefinition<
	'ultimabase.soft-delete.soft-delete',
	'1.0.0',
	undefined,
	readonly [],
	'request',
	'update',
	'after'
> = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input: softDeleteNoInput,
	name: 'ultimabase.soft-delete.soft-delete',
	returning: 'after',
	version: '1.0.0',
})

const restProtocol = defineOperationTransport({
	name: 'ultimabase.rest',
	version: '1.0.0',
})

const graphqlProtocol = defineOperationTransport({
	name: 'ultimabase.graphql',
	version: '1.0.0',
})

const decodeUnitInput = (value: unknown): undefined => {
	softDeleteNoInput.snapshot(value, 'softDelete input')
	return undefined
}

/** @internal Creates instance-owned execution and transport providers. */
export const createExplicitSoftDeleteProviders = (): readonly [
	CapabilityProviderDeclaration<typeof pluginSchemaMutationHandlerCapability>,
	CapabilityProviderDeclaration,
	CapabilityProviderDeclaration,
] =>
	[
		provideSchemaMutationHandler({
			contributionId: 'official-soft-delete-handler',
			create: () => ({
				value: schemaMutationHandler({
					mutation: softDeleteMutation,
					resolve: () => ({
						data: { [softDeleteTombstoneFieldName]: true },
					}),
				}),
			}),
		}),
		provideSchemaMutationTransportBinding({
			contributionId: 'official-soft-delete-rest-binding',
			create: () => ({
				value: schemaMutationTransportBinding({
					codec: schemaMutationWireCodec({
						decode: decodeUnitInput,
						mutation: softDeleteMutation,
						transport: restProtocol,
					}),
					metadata: { errors: {} },
					mutation: softDeleteMutation,
				}),
			}),
		}),
		provideSchemaMutationTransportBinding({
			contributionId: 'official-soft-delete-graphql-binding',
			create: () => ({
				value: schemaMutationTransportBinding({
					codec: schemaMutationWireCodec({
						decode: decodeUnitInput,
						mutation: softDeleteMutation,
						transport: graphqlProtocol,
					}),
					metadata: {
						kind: 'graphql-schema-mutation-binding',
						types: [],
					},
					mutation: softDeleteMutation,
				}),
			}),
		}),
	] as const
