import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { CompiledCommandGraph } from '../../plugins/command-graph.js'
import { projectSchemaMutationTransports } from '../commands/transport-projection.js'
import type { ExposedSchemaMutationTransportBinding } from '../schema-mutations/transport.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'

/** Selects every installed mutation that opted into one canonical transport. */
export interface SchemaMutationTransportPlanningOptions<
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
> {
	readonly transport: TTransport
}

/** Contains only callback-free facts needed to compile schema-local operations. */
export interface ApplicationSchemaMutationTransportPlan<
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
> {
	readonly mutations: readonly ExposedSchemaMutationTransportBinding[]
	readonly transport: TTransport
}

/** Projects the same exact descriptors used by the late execution allowlist. */
export const planApplicationSchemaMutations = <
	const TTransport extends OperationTransportProtocol,
>(
	graph: CompiledCommandGraph,
	options: SchemaMutationTransportPlanningOptions<TTransport>,
): ApplicationSchemaMutationTransportPlan<TTransport> =>
	immutableRecord({
		mutations: immutableArray(
			projectSchemaMutationTransports(graph, options.transport).map(
				({ descriptor }) => descriptor,
			),
		),
		transport: options.transport,
	})
