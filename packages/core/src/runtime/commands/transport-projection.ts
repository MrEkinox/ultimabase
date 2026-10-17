import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { snapshotApplicationContributionOwner } from '../../application/application-operation-contracts.js'

import type {
	CommandSurface,
	CompiledCommandGraph,
	CompiledMutationCommand,
	CompiledOperationCommand,
} from '../../plugins/command-graph.js'
import type {
	OperationTransportImplementation,
	SchemaMutationTransportImplementation,
} from './bindings.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import {
	isOwnedCommandTransport,
	resolveCommandTransport,
} from './default-transports.js'
import type { ExposedOperationTransportBinding } from '../plugin-operations/transport.js'
import type { ExposedSchemaMutationTransportBinding } from '../schema-mutations/transport.js'

// Exact application-owned bindings give inert plans and execution the same identity.
const operations = new WeakMap<
	OperationTransportImplementation,
	ExposedOperationTransportBinding
>()
const mutations = new WeakMap<
	SchemaMutationTransportImplementation,
	Map<CommandSurface, ExposedSchemaMutationTransportBinding>
>()

/** Keeps execution references private while its descriptor is safe for transport planning. */
interface ProjectedSchemaMutationTransport {
	readonly binding: SchemaMutationTransportImplementation
	readonly command: CompiledMutationCommand
	readonly descriptor: ExposedSchemaMutationTransportBinding
}

/** Describes the already validated binding without exposing its private codec. */
export const describeOperationTransport = (
	graph: CompiledCommandGraph,
	command: CompiledOperationCommand,
	binding: OperationTransportImplementation,
): ExposedOperationTransportBinding => {
	let descriptor = operations.get(binding)
	if (descriptor === undefined) {
		const declaration = graph.bindings.publicDeclaration(command)
		descriptor = immutableRecord({
			bound: isOwnedCommandTransport(graph, command, binding.binding.transport),
			errors: command.definition.errors,
			metadata: binding.binding.metadata,
			name: command.definition.name,
			owner: snapshotApplicationContributionOwner(command.owner),
			...(declaration === undefined ? {} : { public: declaration }),
			version: command.definition.version,
		})
		operations.set(binding, descriptor)
	}
	return descriptor
}

/**
 * Lists every public operation with its binding for one protocol: the owner's,
 * or the default one when the owner binds it to no protocol (ADR-0324, ADR-0341).
 */
export const projectPublicOperationTransports = (
	graph: CompiledCommandGraph,
	protocol: OperationTransportProtocol,
): readonly ExposedOperationTransportBinding[] =>
	immutableArray(
		graph.commands
			.flatMap((command) => {
				if (command.kind !== 'operation') return []
				const binding = resolveCommandTransport(graph, command, protocol)
				return binding?.kind === 'operation' &&
					graph.bindings.publicDeclaration(command) !== undefined
					? [describeOperationTransport(graph, command, binding)]
					: []
			})
			.sort((left, right) =>
				(left.public?.name ?? left.name).localeCompare(
					right.public?.name ?? right.name,
				),
			),
	)

/** Projects one selected alias from immutable command facts and its exact binding. */
const describeMutation = (
	command: CompiledMutationCommand,
	surface: CommandSurface,
	binding: SchemaMutationTransportImplementation,
	bound: boolean,
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
			bound,
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

/**
 * Traverses canonical aliases in the existing schema/name order for both
 * consumers. With `bindings: 'optional'`, request commands on one row without
 * a binding for the protocol use Core's default binding (ADR-0324).
 */
export const projectSchemaMutationTransports = (
	graph: CompiledCommandGraph,
	protocol: OperationTransportProtocol,
	bindings: 'optional' | 'required' = 'required',
): readonly ProjectedSchemaMutationTransport[] => {
	const schemaOrder = new Map(
		graph.schemaNames().map((name, index) => [name, index]),
	)
	const entries = graph.commands.flatMap((command) => {
		if (command.kind !== 'mutation') return []
		const binding =
			bindings === 'optional'
				? resolveCommandTransport(graph, command, protocol)
				: graph.bindings.transport(command, protocol)
		if (binding?.kind !== 'mutation') return []
		const bound = isOwnedCommandTransport(graph, command, protocol)
		return command.surfaces.map((surface) =>
			immutableRecord({
				binding,
				command,
				descriptor: describeMutation(command, surface, binding, bound),
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
