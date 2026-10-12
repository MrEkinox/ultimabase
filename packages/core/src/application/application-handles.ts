import type {
	SchemaDefinition,
	SchemaReference,
} from '../schema/schema/definition.js'

import {
	type CompiledApplicationSchemaSurface,
	type CompiledPluginOperation,
} from '../plugins/application-surface-contracts.js'
import {
	readOperationCommand,
	type CompiledCommandGraph,
	type CompiledOperationCommand,
} from '../plugins/command-graph.js'
import { prepareOperationEnvelope } from './operation-envelope.js'
import type {
	PluginOperationDefinition,
	PluginOperationInput,
	PluginOperationResult,
} from '../plugins/plugin-operations.js'

import type { PluginLifecycleState } from '../plugins/lifecycle-manager.js'
import {
	snapshotApplicationContributionOwner,
	type ApplicationContributionOwner,
	type PluginOperationEnvelope,
} from './application-operation-contracts.js'
import {
	createApplicationSchemaMutationMethod,
	type ApplicationSchemaMutationExecutor,
} from './application-schema-mutations.js'
export type {
	ApplicationContributionOwner,
	PluginOperationEnvelope,
	PluginOperationEnvelopeTarget,
} from './application-operation-contracts.js'
interface ApplicationHandleLifetime {
	readonly state: PluginLifecycleState
}
/** Executes one prepared envelope through the facade's active RequestEngine. */
export type ApplicationOperationExecutor = (
	compiled: CompiledOperationCommand,
	envelope: PluginOperationEnvelope,
) => Promise<unknown>
const applicationOperationExecutors = new WeakMap<
	ApplicationOperationHandle,
	ApplicationOperationExecutor
>()
const assertHandleAvailable = (lifetime: ApplicationHandleLifetime): void => {
	if (lifetime.state === 'disposing' || lifetime.state === 'disposed') {
		throw new TypeError('Application handle cannot be used after disposal')
	}
}
/** Resolves one declared operation and prepares immutable envelopes only. */
export class ApplicationOperationHandle<
	TOperation extends PluginOperationDefinition = PluginOperationDefinition,
> {
	readonly definition: TOperation
	readonly owner: ApplicationContributionOwner
	readonly #compiled: CompiledOperationCommand
	readonly #graph: CompiledCommandGraph

	constructor(
		private readonly lifetime: ApplicationHandleLifetime,
		compiled: CompiledPluginOperation,
	) {
		const { command, graph } = readOperationCommand(compiled)
		this.#compiled = command
		this.#graph = graph
		this.definition = compiled.operation as TOperation
		this.owner = snapshotApplicationContributionOwner(command.owner)
		Object.freeze(this)
	}

	/** Validates input and executes through the current application request shell. */
	async execute(
		input: PluginOperationInput<TOperation>,
	): Promise<PluginOperationResult<TOperation>> {
		const envelope = this.prepare(input)
		const executor = applicationOperationExecutors.get(this)
		if (executor === undefined) {
			throw new TypeError('Application operation execution is unavailable')
		}
		return (await executor(
			this.#compiled,
			envelope,
		)) as PluginOperationResult<TOperation>
	}

	/** Validates and snapshots input without executing Runtime or exposing a transport. */
	prepare(
		input: PluginOperationInput<TOperation>,
	): PluginOperationEnvelope<TOperation> {
		assertHandleAvailable(this.lifetime)
		return prepareOperationEnvelope(
			this.#graph,
			this.#compiled,
			input,
		) as PluginOperationEnvelope<TOperation>
	}
}

/** Installs the facade-owned executor without making it part of the public handle. */
export const registerApplicationOperationExecutor = (
	handle: ApplicationOperationHandle,
	executor: ApplicationOperationExecutor,
): void => {
	applicationOperationExecutors.set(handle, executor)
}
/** Represents one schema through an application, without a constructible class. */
export type ApplicationSchemaHandle<
	TSchema extends SchemaDefinition = SchemaDefinition,
> = ApplicationSchemaHandleBase<TSchema>

/** Owns application-specific schema mutations. */
export class ApplicationSchemaHandleBase<
	TSchema extends SchemaDefinition = SchemaDefinition,
> {
	readonly schema: TSchema

	constructor(
		private readonly lifetime: ApplicationHandleLifetime,
		private readonly surface: CompiledApplicationSchemaSurface,
		private readonly executeSchemaMutation: ApplicationSchemaMutationExecutor,
	) {
		this.schema = surface.schema as TSchema
		Object.freeze(this)
		const handle = new Proxy(this, {
			get: (target, property, receiver): unknown => {
				if (typeof property === 'string') {
					if (target.surface.schemaMutations.has(property)) {
						return target.createSchemaMutationMethod(property)
					}
				}
				return Reflect.get(target, property, receiver)
			},
			has: (target, property): boolean =>
				(typeof property === 'string' &&
					target.surface.schemaMutations.has(property)) ||
				Reflect.has(target, property),
		})
		return handle
	}

	private createSchemaMutationMethod(name: string) {
		const command = this.surface.schemaMutations.get(name)
		if (command === undefined) {
			throw new TypeError(`Unknown ${this.schema.className} mutation: ${name}`)
		}
		return createApplicationSchemaMutationMethod({
			assertAvailable: () => {
				assertHandleAvailable(this.lifetime)
			},
			command,
			execute: this.executeSchemaMutation,
			name,
			schema: this.schema,
		})
	}
}

/** Resolves a schema handle from a literal name registered on the application. */
export type ApplicationSchemaHandleForName<TClassName extends string> =
	ApplicationSchemaHandle<SchemaReference<TClassName>>
