import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { FrameworkError } from '../../errors/framework-error.js'
import type {
	CompiledCommand,
	CompiledCommandGraph,
} from '../../plugins/command-graph.js'
import type { PluginOperationValueContract } from '../../plugins/plugin-operations.js'
import {
	operationTransportBinding,
	operationWireCodec,
} from '../plugin-operations/capabilities.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import {
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
} from '../schema-mutations/transport-capabilities.js'
import type { CommandTransportBinding } from './bindings.js'

// One default per command and protocol keeps descriptor identities stable.
const defaults = new WeakMap<
	CompiledCommand,
	Map<OperationTransportProtocol, CommandTransportBinding>
>()

/**
 * Snapshots wire input through the command's own contract; a rejected value
 * is the client's `VALIDATION_ERROR`, never an internal failure.
 */
const decodeWithContract =
	<TValue>(contract: PluginOperationValueContract<TValue>) =>
	(value: unknown): TValue => {
		try {
			return contract.snapshot(value, 'input')
		} catch (error: unknown) {
			if (!(error instanceof TypeError)) throw error
			const issues = immutableArray([
				immutableRecord({
					code: 'input.invalid',
					message: error.message,
					path: immutableArray(['input']),
				}),
			])
			throw new FrameworkError('VALIDATION_ERROR', error.message, {
				cause: error,
				publicMessage: 'The operation input is invalid.',
				publicDetails: { issues },
				internalDetails: { issues },
			})
		}
	}

/**
 * Reads the owner's binding of one command for a protocol or, for a command
 * a transport may expose without one (a public operation its owner binds to
 * no protocol, a request command on one row), a default binding that keeps
 * the wire value and validates it with the command's own input contract
 * (ADR-0324). An owner that binds a public operation to any protocol chose
 * its transports: the others get no default (ADR-0341).
 */
export const resolveCommandTransport = (
	graph: CompiledCommandGraph,
	command: CompiledCommand,
	protocol: OperationTransportProtocol,
): CommandTransportBinding | undefined => {
	const owned = graph.bindings.transport(command, protocol)
	if (owned !== undefined) return owned
	const exposable =
		command.kind === 'operation'
			? graph.bindings.publicDeclaration(command) !== undefined &&
				!graph.bindings.hasTransports(command)
			: command.definition.authority === 'request' &&
				command.definition.target === 'one'
	if (!exposable) return undefined
	let byProtocol = defaults.get(command)
	if (byProtocol === undefined) {
		byProtocol = new Map()
		defaults.set(command, byProtocol)
	}
	const cached = byProtocol.get(protocol)
	if (cached !== undefined) return cached
	const source = graph.source(command)
	const common = {
		contributionId: `${command.kind === 'operation' ? 'operation' : 'schema-mutation'}:${command.definition.name}:transport:${protocol.name}:default`,
		owner: command.owner,
	}
	let binding: CommandTransportBinding
	if (source.kind === 'plugin-operation') {
		binding = immutableRecord({
			...common,
			kind: 'operation' as const,
			binding: operationTransportBinding({
				codec: operationWireCodec({
					decode: decodeWithContract(source.input),
					encode: (value: unknown): unknown => value,
					operation: source,
					transport: protocol,
				}),
				operation: source,
			}),
		})
	} else {
		binding = immutableRecord({
			...common,
			kind: 'mutation' as const,
			binding: schemaMutationTransportBinding({
				codec: schemaMutationWireCodec({
					decode: decodeWithContract(source.input),
					mutation: source,
					transport: protocol,
				}),
				mutation: source,
			}),
		})
	}
	byProtocol.set(protocol, binding)
	return binding
}

/** Reports whether a transport uses the owner's binding or the default one. */
export const isOwnedCommandTransport = (
	graph: CompiledCommandGraph,
	command: CompiledCommand,
	protocol: OperationTransportProtocol,
): boolean => graph.bindings.transport(command, protocol) !== undefined
