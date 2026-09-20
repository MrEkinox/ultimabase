import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { CompiledApplicationSchemaSurface } from '../../plugins/application-surface-registry.js'
import type { CapabilityProviderContribution } from '../../plugins/capabilities.js'
import { readApplicationCommandGraph } from '../../plugins/application-command-graph.js'
import { readPluginSchemaMutationSource } from '../../plugins/plugin-schema-mutations.js'
import type { CompiledSchemaRegistry } from '../../schema/index.js'
import { isSchemaMutationTransportBinding } from '../schema-mutations/transport-capabilities.js'
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

interface SchemaMutationTransportPlanningState {
	readonly application: object
	readonly bindings: readonly CapabilityProviderContribution[]
	readonly resolveSurface: (
		className: string,
	) => CompiledApplicationSchemaSurface | undefined
	readonly schemas: CompiledSchemaRegistry
}

/** @internal Plans exact schema and command pairs without retaining codecs. */
export const planApplicationSchemaMutations = <
	const TTransport extends OperationTransportProtocol,
>(
	state: SchemaMutationTransportPlanningState,
	options: SchemaMutationTransportPlanningOptions<TTransport>,
): ApplicationSchemaMutationTransportPlan<TTransport> => {
	const bindings = readApplicationCommandGraph(state.application).bindings

	const usedBindings = new Set<object>()
	const mutations: ExposedSchemaMutationTransportBinding[] = []
	for (const schema of state.schemas.values()) {
		const surface = state.resolveSurface(schema.className)
		if (surface?.schema !== schema) continue
		const commands = new Map([
			...surface.schemaMutations,
			...surface.modelMutations,
		])
		for (const [commandName, command] of [...commands].sort(([left], [right]) =>
			left.localeCompare(right),
		)) {
			const source = readPluginSchemaMutationSource(command.mutation)
			const owned = bindings.transport(source, options.transport)
			if (owned?.kind !== 'mutation') continue
			const binding = owned.binding
			usedBindings.add(source)
			mutations.push(
				immutableRecord({
					authority: command.mutation.authority,
					command: commandName,
					effect: command.mutation.effect,
					errors: command.mutation.errors,
					metadata: binding.metadata,
					mutation: command.mutation.name,
					owner: command.owner,
					returning: command.mutation.returning,
					schema: schema.className,
					version: command.mutation.version,
				}),
			)
		}
	}
	for (const contribution of state.bindings) {
		const binding = contribution.value
		if (
			!isSchemaMutationTransportBinding(binding) ||
			binding.transport !== options.transport ||
			usedBindings.has(binding.mutation)
		)
			continue
		throw new TypeError(
			`Schema mutation ${binding.mutation.name} transport binding has no installed schema surface`,
		)
	}

	return immutableRecord({
		mutations: immutableArray(mutations),
		transport: options.transport,
	})
}
