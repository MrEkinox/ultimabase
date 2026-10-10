import {
	contributeSchemaMutation,
	defineOperationTransport,
	defineSchemaMutation,
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
	type PluginSchemaMutationContribution,
	type PluginSchemaMutationDefinition,
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
	'before'
> = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input: softDeleteNoInput,
	name: 'ultimabase.soft-delete.soft-delete',
	// Like a delete, a soft delete answers with the pre-image: the row it hides
	// is checked against the read rules before it disappears (ADR-0306).
	returning: 'before',
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

/** @internal Creates one owned mutation contribution with both wire bindings. */
export const createExplicitSoftDeleteContribution =
	(): PluginSchemaMutationContribution<typeof softDeleteMutation> =>
		contributeSchemaMutation({
			mutation: softDeleteMutation,
			resolve: () => ({
				data: { [softDeleteTombstoneFieldName]: true },
			}),
			bindings: [
				schemaMutationTransportBinding({
					codec: schemaMutationWireCodec({
						decode: decodeUnitInput,
						mutation: softDeleteMutation,
						transport: restProtocol,
					}),
					metadata: { errors: {} },
					mutation: softDeleteMutation,
				}),
				schemaMutationTransportBinding({
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
			] as const,
		})
