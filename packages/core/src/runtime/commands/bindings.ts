import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { FrameworkError } from '../../errors/framework-error.js'
import type {
	CapabilityProviderContribution,
	CapabilityToken,
} from '../../plugins/capabilities.js'
import type {
	CommandSource,
	CompiledCommand,
} from '../../plugins/command-graph.js'
import { formatPluginIdentity } from '../../plugins/manifest.js'
import { isPluginOperationDefinition } from '../../plugins/plugin-operations.js'
import { isPluginSchemaMutationDefinition } from '../../plugins/plugin-schema-mutations.js'
import {
	getPluginOperationHandler,
	isOperationTransportBinding,
	operationTransportBindingCapability,
	pluginOperationHandlerCapability,
} from '../plugin-operations/capabilities.js'
import type {
	OperationTransportBindingDefinition,
	OperationTransportProtocol,
	PluginOperationHandler,
} from '../plugin-operations/contracts.js'
import {
	getPluginSchemaMutationHandler,
	pluginSchemaMutationHandlerCapability,
} from '../schema-mutations/capabilities.js'
import type { PluginSchemaMutationHandler } from '../schema-mutations/contracts.js'
import {
	isSchemaMutationTransportBinding,
	schemaMutationTransportBindingCapability,
} from '../schema-mutations/transport-capabilities.js'
import type { SchemaMutationTransportBindingDefinition } from '../schema-mutations/transport-contracts.js'

interface OwnedImplementation {
	readonly contributionId: string
	readonly owner: Omit<CompiledCommand['owner'], 'kind'>
}
export type CommandHandler = OwnedImplementation &
	(
		| Readonly<{ kind: 'operation'; execute: PluginOperationHandler }>
		| Readonly<{ kind: 'mutation'; resolve: PluginSchemaMutationHandler }>
	)
export type CommandTransportBinding = OwnedImplementation &
	(
		| Readonly<{
				kind: 'operation'
				binding: OperationTransportBindingDefinition
		  }>
		| Readonly<{
				kind: 'mutation'
				binding: SchemaMutationTransportBindingDefinition
		  }>
	)
interface Implementations {
	readonly handler?: CommandHandler
	readonly transports: ReadonlyMap<
		OperationTransportProtocol,
		CommandTransportBinding
	>
}

const failure = (
	contribution: CapabilityProviderContribution,
	kind: string,
	message: string,
	operation?: string,
): FrameworkError<'PLUGIN_OPERATION_INVALID'> =>
	new FrameworkError('PLUGIN_OPERATION_INVALID', message, {
		publicMessage: 'The requested operation could not be completed.',
		internalDetails: {
			kind,
			...(operation === undefined ? {} : { operation }),
			plugin: formatPluginIdentity(contribution.owner),
			contributionId: contribution.contributionId,
		},
	})

/** Binds only the four retained command protocols to already compiled records. */
export class CommandBindings {
	readonly #fromSource: (source: CommandSource) => CompiledCommand | undefined
	readonly #entries = new Map<CompiledCommand, Implementations>()
	readonly #bound = new Set<CapabilityToken>()
	#disposed = false

	constructor(
		fromSource: (source: CommandSource) => CompiledCommand | undefined,
	) {
		this.#fromSource = fromSource
	}

	/** Publishes each complete capability batch once, after all owner checks pass. */
	materialize(
		token: CapabilityToken,
		contributions: readonly CapabilityProviderContribution[],
	): void {
		const operationHandler = token === pluginOperationHandlerCapability
		const mutationHandler = token === pluginSchemaMutationHandlerCapability
		const operationTransport = token === operationTransportBindingCapability
		const mutationTransport = token === schemaMutationTransportBindingCapability
		if (
			!operationHandler &&
			!mutationHandler &&
			!operationTransport &&
			!mutationTransport
		)
			return
		this.#assertAvailable()
		if (this.#bound.has(token))
			throw new TypeError('Command capability is already bound')
		const pending = new Map<CompiledCommand, Implementations>()
		for (const contribution of contributions) {
			const value = contribution.value
			const prefix =
				operationHandler || operationTransport ? 'operation' : 'schema-mutation'
			const category =
				operationHandler || mutationHandler ? 'handler' : 'transport'
			const invalid = () =>
				failure(
					contribution,
					`${prefix}-${category}-owner-invalid`,
					`Plugin "${formatPluginIdentity(contribution.owner)}" provided an invalid ${prefix} ${category}.`,
				)
			let source: CommandSource
			let implementation: CommandHandler | CommandTransportBinding
			const owner = immutableRecord({
				pluginId: contribution.owner.pluginId,
				...(contribution.owner.instanceId === undefined
					? {}
					: { instanceId: contribution.owner.instanceId }),
				version: contribution.pluginVersion,
			})
			const provenance = { contributionId: contribution.contributionId, owner }
			if (operationHandler) {
				const execute = getPluginOperationHandler(value)
				if (
					execute === undefined ||
					!isPlainRecord(value) ||
					!isPluginOperationDefinition(value.operation)
				)
					throw invalid()
				source = value.operation
				implementation = immutableRecord({
					...provenance,
					kind: 'operation' as const,
					execute,
				})
			} else if (mutationHandler) {
				const resolve = getPluginSchemaMutationHandler(value)
				if (
					resolve === undefined ||
					!isPlainRecord(value) ||
					!isPluginSchemaMutationDefinition(value.mutation)
				)
					throw invalid()
				source = value.mutation
				implementation = immutableRecord({
					...provenance,
					kind: 'mutation' as const,
					resolve,
				})
			} else if (operationTransport) {
				if (!isOperationTransportBinding(value)) throw invalid()
				source = value.operation
				implementation = immutableRecord({
					...provenance,
					kind: 'operation' as const,
					binding: value,
				})
			} else {
				if (!isSchemaMutationTransportBinding(value)) throw invalid()
				source = value.mutation
				implementation = immutableRecord({
					...provenance,
					kind: 'mutation' as const,
					binding: value,
				})
			}
			const command = this.#fromSource(source)
			// Unselected mutation providers remain inert, as with the retained selector contract.
			if (
				source.kind === 'plugin-schema-mutation' &&
				(command === undefined ||
					(command.kind === 'mutation' && command.surfaces.length === 0))
			)
				continue
			if (
				command?.owner.pluginId !== owner.pluginId ||
				command.owner.instanceId !== owner.instanceId ||
				command.owner.version !== owner.version
			)
				throw invalid()
			const prior: Implementations = pending.get(command) ??
				this.#entries.get(command) ?? {
					transports: new Map<
						OperationTransportProtocol,
						CommandTransportBinding
					>(),
				}
			if ('binding' in implementation) {
				const transport = implementation.binding.transport
				if (prior.transports.has(transport))
					throw failure(
						contribution,
						`${prefix}-transport-conflict`,
						`${command.kind === 'operation' ? 'Operation' : 'Schema mutation'} ${source.name} has duplicate bindings for ${transport.name}.`,
						source.name,
					)
				pending.set(command, {
					...prior,
					transports: new Map([
						...prior.transports,
						[transport, implementation],
					]),
				})
			} else {
				if (prior.handler !== undefined)
					throw failure(
						contribution,
						`${prefix}-handler-conflict`,
						`${command.kind === 'operation' ? 'Operation' : 'Schema mutation'} ${source.name} has multiple handlers.`,
						source.name,
					)
				pending.set(command, { ...prior, handler: implementation })
			}
		}
		for (const [command, implementation] of pending)
			this.#entries.set(command, implementation)
		this.#bound.add(token)
	}

	/** Reads the exact attributed implementation without accepting registrations. */
	handler(source: CommandSource | CompiledCommand): CommandHandler | undefined {
		return this.#read(source)?.handler
	}

	/** Static and executable projections resolve the same canonical binding. */
	transport(
		source: CommandSource | CompiledCommand,
		protocol: OperationTransportProtocol,
	): CommandTransportBinding | undefined {
		return this.#read(source)?.transports.get(protocol)
	}

	/** Releases owned closures even when a caller retains an old execution view. */
	dispose(): void {
		this.#disposed = true
		this.#entries.clear()
		this.#bound.clear()
	}

	#read(source: CommandSource | CompiledCommand): Implementations | undefined {
		this.#assertAvailable()
		const command =
			source.kind === 'operation' || source.kind === 'mutation'
				? source
				: this.#fromSource(source)
		return command === undefined ? undefined : this.#entries.get(command)
	}

	#assertAvailable(): void {
		if (this.#disposed)
			throw new TypeError(
				'Application command bindings are no longer available',
			)
	}
}
