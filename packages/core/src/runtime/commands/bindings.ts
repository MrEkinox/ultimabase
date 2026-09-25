import { immutableRecord } from '@ultimabase/shared'

import { FrameworkError } from '../../errors/framework-error.js'
import type {
	CommandSource,
	CompiledCommand,
} from '../../plugins/command-graph.js'
import { formatPluginIdentity } from '../../plugins/manifest.js'
import type {
	PluginCommandHandlerResource,
	PluginCommandSource,
	PluginCommandTransportPlan,
} from '../../plugins/plugin-command-plan.js'
import type { PluginSchemaContributionOwner } from '../../schema/schema/provenance.js'
import type {
	OperationTransportBindingDefinition,
	OperationTransportProtocol,
	PluginOperationHandler,
} from '../plugin-operations/contracts.js'
import type { PluginSchemaMutationHandler } from '../schema-mutations/contracts.js'
import type { SchemaMutationTransportBindingDefinition } from '../schema-mutations/transport-contracts.js'

interface OwnedImplementation {
	readonly contributionId: string
	readonly owner: PluginSchemaContributionOwner
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

export interface OwnedCommandHandlerPlan extends OwnedImplementation {
	readonly resource: PluginCommandHandlerResource
	readonly source: PluginCommandSource
}

export type OwnedCommandTransportPlan = PluginCommandTransportPlan &
	Readonly<{ owner: PluginSchemaContributionOwner }>

interface Implementations {
	readonly handler?: CommandHandler
	readonly transports: ReadonlyMap<
		OperationTransportProtocol,
		CommandTransportBinding
	>
}

const failure = (
	plan: OwnedImplementation,
	kind: string,
	message: string,
	operation?: string,
): FrameworkError<'PLUGIN_OPERATION_INVALID'> =>
	new FrameworkError('PLUGIN_OPERATION_INVALID', message, {
		publicMessage: 'The requested operation could not be completed.',
		internalDetails: {
			kind,
			...(operation === undefined ? {} : { operation }),
			plugin: formatPluginIdentity(plan.owner),
			contributionId: plan.contributionId,
		},
	})

const matchesOwner = (
	command: CompiledCommand,
	owner: PluginSchemaContributionOwner,
): boolean =>
	command.owner.pluginId === owner.pluginId &&
	command.owner.instanceId === owner.instanceId &&
	command.owner.version === owner.version

const isDormantMutation = (
	source: CommandSource,
	command: CompiledCommand | undefined,
): boolean =>
	source.kind === 'plugin-schema-mutation' &&
	(command === undefined ||
		(command.kind === 'mutation' && command.surfaces.length === 0))

/** Binds native command facts to the already compiled application graph. */
export class CommandBindings {
	readonly #fromSource: (source: CommandSource) => CompiledCommand | undefined
	readonly #entries = new Map<CompiledCommand, Implementations>()
	#handlersBound = false
	#transportsBound = false
	#disposed = false

	constructor(
		fromSource: (source: CommandSource) => CompiledCommand | undefined,
	) {
		this.#fromSource = fromSource
	}

	/** Publishes one complete transport batch after every owner check passes. */
	bindTransports(plans: readonly OwnedCommandTransportPlan[]): void {
		this.#assertAvailable()
		if (this.#transportsBound)
			throw new TypeError('Command transports are already bound')
		const pending = new Map<CompiledCommand, Implementations>()
		for (const plan of plans) {
			const command = this.#fromSource(plan.source)
			const kind = plan.kind === 'mutation' ? 'schema-mutation' : 'operation'
			if (isDormantMutation(plan.source, command)) continue
			if (
				command === undefined ||
				!matchesOwner(command, plan.owner) ||
				(plan.kind === 'operation') !== (command.kind === 'operation') ||
				(plan.kind === 'operation'
					? plan.binding.operation !== plan.source
					: plan.binding.mutation !== plan.source)
			) {
				throw failure(
					plan,
					`${kind}-transport-owner-invalid`,
					`Plugin "${formatPluginIdentity(plan.owner)}" provided an invalid ${plan.kind} transport.`,
				)
			}

			const prior: Implementations = pending.get(command) ??
				this.#entries.get(command) ?? { transports: new Map() }
			const protocol = plan.binding.transport
			if (prior.transports.has(protocol)) {
				throw failure(
					plan,
					`${kind}-transport-conflict`,
					`${command.kind === 'operation' ? 'Operation' : 'Schema mutation'} ${plan.source.name} has duplicate bindings for ${protocol.name}.`,
					plan.source.name,
				)
			}
			const implementation = immutableRecord({
				binding: plan.binding,
				contributionId: plan.contributionId,
				kind: plan.kind,
				owner: plan.owner,
			}) as CommandTransportBinding
			pending.set(command, {
				...prior,
				transports: new Map([...prior.transports, [protocol, implementation]]),
			})
		}
		for (const [command, implementation] of pending)
			this.#entries.set(command, implementation)
		this.#transportsBound = true
	}

	/** Publishes one complete handler batch after every owner check passes. */
	bindHandlers(plans: readonly OwnedCommandHandlerPlan[]): void {
		this.#assertAvailable()
		if (this.#handlersBound)
			throw new TypeError('Command handlers are already bound')
		const pending = new Map<CompiledCommand, Implementations>()
		for (const plan of plans) {
			const command = this.#fromSource(plan.source)
			const kind =
				plan.resource.kind === 'mutation' ? 'schema-mutation' : 'operation'
			if (isDormantMutation(plan.source, command)) continue
			if (
				command === undefined ||
				!matchesOwner(command, plan.owner) ||
				(plan.resource.kind === 'operation') !== (command.kind === 'operation')
			) {
				throw failure(
					plan,
					`${kind}-handler-owner-invalid`,
					`Plugin "${formatPluginIdentity(plan.owner)}" provided an invalid ${plan.resource.kind} handler.`,
				)
			}

			const prior: Implementations = pending.get(command) ??
				this.#entries.get(command) ?? { transports: new Map() }
			if (prior.handler !== undefined) {
				throw failure(
					plan,
					`${kind}-handler-conflict`,
					`${command.kind === 'operation' ? 'Operation' : 'Schema mutation'} ${plan.source.name} has multiple handlers.`,
					plan.source.name,
				)
			}
			const handler = immutableRecord({
				contributionId: plan.contributionId,
				owner: plan.owner,
				...(plan.resource.kind === 'operation'
					? { execute: plan.resource.execute, kind: 'operation' as const }
					: { kind: 'mutation' as const, resolve: plan.resource.resolve }),
			})
			pending.set(command, { ...prior, handler })
		}
		for (const [command, implementation] of pending)
			this.#entries.set(command, implementation)
		this.#handlersBound = true
	}

	/** Reads the exact attributed implementation without accepting registrations. */
	handler(command: CompiledCommand): CommandHandler | undefined {
		return this.#read(command)?.handler
	}

	/** Static and executable projections resolve the same canonical binding. */
	transport(
		command: CompiledCommand,
		protocol: OperationTransportProtocol,
	): CommandTransportBinding | undefined {
		return this.#read(command)?.transports.get(protocol)
	}

	/** Releases owned closures even when a caller retains an old execution view. */
	dispose(): void {
		this.#disposed = true
		this.#entries.clear()
	}

	#read(command: CompiledCommand): Implementations | undefined {
		this.#assertAvailable()
		return this.#entries.get(command)
	}

	#assertAvailable(): void {
		if (this.#disposed)
			throw new TypeError(
				'Application command bindings are no longer available',
			)
	}
}
