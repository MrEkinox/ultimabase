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
	'after'
> = defineSchemaMutation({
	authority: 'request',
	// The row it hides is checked against the read rules before it disappears;
	// the result is the post-image (ADR-0306, step 2 amendment).
	checkReadable: 'before',
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
