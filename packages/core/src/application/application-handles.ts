import type {
	SchemaDefinition,
	SchemaReference,
} from '../schema/schema/definition.js'
import type { SchemaModelState } from '../schema/schema/model-contracts.js'
import {
	isSchemaModelInstance,
	readSchemaModelRecord,
} from '../schema/schema/model-state.js'

import {
	type CompiledApplicationSchemaSurface,
	type CompiledPluginOperation,
	type CompiledSchemaMutationCommand,
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
import type {
	UltimaBaseGeneratedOperations,
	UltimaBaseGeneratedSchemaSurfaces,
} from '../schema/type-info.js'
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
/** Exposes compiled mutation commands as dynamic methods of one frozen handle. */
const withMutationMethods = <THandle extends object>(
	handle: THandle,
	options: Readonly<{
		readonly commands: ReadonlyMap<string, CompiledSchemaMutationCommand>
		readonly lifetime: ApplicationHandleLifetime
		readonly model?: object
		readonly schema: SchemaDefinition
		readonly execute: ApplicationSchemaMutationExecutor
	}>,
): THandle => {
	const { commands, lifetime, ...method } = options
	const has = (property: PropertyKey): property is string =>
		typeof property === 'string' && commands.has(property)
	return new Proxy(handle, {
		get: (target, property, receiver): unknown => {
			if (!has(property)) return Reflect.get(target, property, receiver)
			const command = commands.get(property)
			if (command === undefined) {
				throw new TypeError(
					`Unknown ${method.schema.className} mutation: ${property}`,
				)
			}
			return createApplicationSchemaMutationMethod({
				...method,
				assertAvailable: () => {
					assertHandleAvailable(lifetime)
				},
				command,
				name: property,
			})
		},
		has: (target, property): boolean =>
			has(property) || Reflect.has(target, property),
	})
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
type GeneratedOperation<TName extends string> =
	TName extends keyof UltimaBaseGeneratedOperations
		? UltimaBaseGeneratedOperations[TName] extends PluginOperationDefinition
			? UltimaBaseGeneratedOperations[TName]
			: PluginOperationDefinition
		: PluginOperationDefinition

type GeneratedSchemaSurface<TSchema extends SchemaDefinition> =
	TSchema['className'] extends keyof UltimaBaseGeneratedSchemaSurfaces
		? UltimaBaseGeneratedSchemaSurfaces[TSchema['className']]
		: never

type SurfacePart<TSchema extends SchemaDefinition, TKey extends PropertyKey> =
	GeneratedSchemaSurface<TSchema> extends Record<TKey, infer TValue>
		? TValue
		: Readonly<Record<never, never>>

/** Represents one schema through an application, without a constructible class. */
export type ApplicationSchemaHandle<
	TSchema extends SchemaDefinition = SchemaDefinition,
> = ApplicationSchemaHandleBase<TSchema> & SurfacePart<TSchema, 'schema'>

/** Owns application-specific schema mutations and immutable model binding. */
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
		return withMutationMethods(this, {
			commands: this.surface.schemaMutations,
			execute: this.executeSchemaMutation,
			lifetime: this.lifetime,
			schema: this.schema,
		})
	}

	/** Binds one trusted draft or persisted model without copying its identity. */
	for(model: object): ApplicationModelHandleFor<TSchema> {
		assertHandleAvailable(this.lifetime)
		if (!isSchemaModelInstance(this.schema, model)) {
			throw new TypeError(
				`Model handle requires an exact ${this.schema.className} model`,
			)
		}
		const record = readSchemaModelRecord(model)
		if (record.state !== 'draft' && record.state !== 'persisted') {
			throw new TypeError(
				'Model handle requires draft or persisted model state',
			)
		}
		return new ApplicationModelHandle(
			this.lifetime,
			this.schema,
			model,
			record.state,
			this.surface,
			this.executeSchemaMutation,
		) as ApplicationModelHandleFor<TSchema>
	}
}

/** Binds plugin commands to one exact immutable draft or persisted model. */
export class ApplicationModelHandle<
	TSchema extends SchemaDefinition = SchemaDefinition,
> {
	constructor(
		private readonly lifetime: ApplicationHandleLifetime,
		readonly schema: TSchema,
		readonly model: object,
		readonly state: Extract<SchemaModelState, 'draft' | 'persisted'>,
		private readonly surface: CompiledApplicationSchemaSurface,
		private readonly executeSchemaMutation: ApplicationSchemaMutationExecutor,
	) {
		Object.freeze(this)
		return withMutationMethods(this, {
			commands: this.surface.modelMutations,
			execute: this.executeSchemaMutation,
			lifetime: this.lifetime,
			model,
			schema,
		})
	}
}

/** Resolves exact generated direct methods for one immutable model handle. */
export type ApplicationModelHandleFor<TSchema extends SchemaDefinition> =
	ApplicationModelHandle<TSchema> & SurfacePart<TSchema, 'model'>

/** Resolves one exact generated operation from its stable namespaced name. */
export type ApplicationOperationHandleForName<TName extends string> =
	ApplicationOperationHandle<GeneratedOperation<TName>>

/** Resolves an exact schema reference from a generated literal name. */
export type ApplicationSchemaHandleForName<TClassName extends string> =
	ApplicationSchemaHandle<SchemaReference<TClassName>>
