import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	CommandSurface,
	CompiledCommandGraph,
	CompiledMutationCommand,
	CompiledOperationCommand,
} from '../../plugins/command-graph.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import type { OwnedTransportBinding } from '../plugin-operations/runtime.js'
import type { ExposedOperationTransportBinding } from '../plugin-operations/transport.js'
import type { OwnedSchemaMutationTransportBinding } from '../schema-mutations/runtime.js'
import type { ExposedSchemaMutationTransportBinding } from '../schema-mutations/transport.js'

// Exact application-owned bindings give inert plans and execution the same identity.
const operations = new WeakMap<
	OwnedTransportBinding,
	ExposedOperationTransportBinding
>()
const mutations = new WeakMap<
	OwnedSchemaMutationTransportBinding,
	Map<CommandSurface, ExposedSchemaMutationTransportBinding>
>()

/** Keeps execution references private while its descriptor is safe for transport planning. */
interface ProjectedSchemaMutationTransport {
	readonly binding: OwnedSchemaMutationTransportBinding
	readonly command: CompiledMutationCommand
	readonly descriptor: ExposedSchemaMutationTransportBinding
}

/** Describes the already validated binding without exposing its private codec. */
export const describeOperationTransport = (
	command: CompiledOperationCommand,
	binding: OwnedTransportBinding,
): ExposedOperationTransportBinding => {
	let descriptor = operations.get(binding)
	if (descriptor === undefined) {
		descriptor = immutableRecord({
			errors: command.definition.errors,
			metadata: binding.binding.metadata,
			name: command.definition.name,
			owner: immutableRecord({
				...(command.owner.instanceId === undefined
					? {}
					: { instanceId: command.owner.instanceId }),
				pluginId: command.owner.pluginId,
				version: command.owner.version,
			}),
			version: command.definition.version,
		})
		operations.set(binding, descriptor)
	}
	return descriptor
}

/** Projects one selected alias from immutable command facts and its exact binding. */
const describeMutation = (
	command: CompiledMutationCommand,
	surface: CommandSurface,
	binding: OwnedSchemaMutationTransportBinding,
): ExposedSchemaMutationTransportBinding => {
	let aliases = mutations.get(binding)
	if (aliases === undefined) {
		aliases = new Map()
		mutations.set(binding, aliases)
	}
	let descriptor = aliases.get(surface)
	if (descriptor === undefined) {
		descriptor = immutableRecord({
			authority: command.definition.authority,
			command: surface.name,
			effect: command.definition.effect,
			errors: command.definition.errors,
			metadata: binding.binding.metadata,
			mutation: command.definition.name,
			owner: command.owner,
			returning: command.definition.returning,
			schema: surface.className,
			version: command.definition.version,
		})
		aliases.set(surface, descriptor)
	}
	return descriptor
}

/** Traverses canonical aliases in the existing schema/name order for both consumers. */
export const projectSchemaMutationTransports = (
	graph: CompiledCommandGraph,
	protocol: OperationTransportProtocol,
): readonly ProjectedSchemaMutationTransport[] => {
	const schemaOrder = new Map(
		graph.schemaNames().map((name, index) => [name, index]),
	)
	const entries = graph.commands.flatMap((command) => {
		if (command.kind !== 'mutation') return []
		const binding = graph.bindings.transport(command, protocol)
		if (binding?.kind !== 'mutation') return []
		return command.surfaces.map((surface) =>
			immutableRecord({
				binding,
				command,
				descriptor: describeMutation(command, surface, binding),
			}),
		)
	})
	return immutableArray(
		entries.sort(
			(left, right) =>
				(schemaOrder.get(left.descriptor.schema) ?? 0) -
					(schemaOrder.get(right.descriptor.schema) ?? 0) ||
				left.descriptor.command.localeCompare(right.descriptor.command),
		),
	)
}
