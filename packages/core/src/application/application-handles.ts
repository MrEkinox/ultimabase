import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import type { OperationOptions } from '../query/operations/options.js'
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
	coreSchemaHandleCommandNames,
	type CompiledApplicationSchemaSurface,
	type CompiledPluginOperation,
	type CompiledSchemaMutationCommand,
} from '../plugins/application-surface-registry.js'
import { assertImmutableOperationValue } from '../plugins/plugin-operation-boundaries.js'
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
	registerApplicationSchemaModelViewHost,
	type ApplicationSchemaModelViewState,
} from './application-model-views.js'
import {
	snapshotApplicationContributionOwner,
	type ApplicationContributionOwner,
	type PluginOperationEnvelope,
	type PluginOperationEnvelopeTarget,
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
	compiled: CompiledPluginOperation,
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
	readonly #compiled: CompiledPluginOperation

	constructor(
		private readonly lifetime: ApplicationHandleLifetime,
		compiled: CompiledPluginOperation,
	) {
		this.#compiled = compiled
		this.definition = compiled.operation as TOperation
		this.owner = snapshotApplicationContributionOwner(compiled.owner)
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
		const payload = this.definition.input.snapshot(
			input,
			`${this.definition.name}.input`,
		) as PluginOperationInput<TOperation>
		assertImmutableOperationValue(payload, `${this.definition.name}.input`)
		const target: PluginOperationEnvelopeTarget = immutableRecord({
			kind: 'application',
		})
		const envelope = immutableRecord({
			kind: 'plugin-operation' as const,
			name: this.definition.name,
			payload,
			target,
			transaction: this.definition.transaction,
			version: this.definition.version,
		}) as PluginOperationEnvelope<TOperation>
		return envelope
	}
}

/** Installs the facade-owned executor without making it part of the public handle. */
export const registerApplicationOperationExecutor = (
	handle: ApplicationOperationHandle,
	executor: ApplicationOperationExecutor,
): void => {
	applicationOperationExecutors.set(handle, executor)
}
const schemaCommandNames: ReadonlySet<string> = new Set(
	coreSchemaHandleCommandNames,
)

type SchemaCommandName = (typeof coreSchemaHandleCommandNames)[number]

type CoreSchemaHandleCommands<TSchema extends SchemaDefinition> = Pick<
	TSchema,
	Extract<keyof TSchema, SchemaCommandName>
>

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
> = CoreSchemaHandleCommands<TSchema> &
	ApplicationSchemaHandleBase<TSchema> &
	SurfacePart<TSchema, 'schema'>

const mergeApplicationOptions = (
	options: unknown,
	ultimabase: NonNullable<OperationOptions['ultimabase']>,
): OperationOptions => {
	if (options === undefined) return immutableRecord({ ultimabase })
	if (!isPlainRecord(options)) {
		throw new TypeError(
			'schema handle operation options must be a plain object',
		)
	}
	if (options.ultimabase !== undefined && options.ultimabase !== ultimabase) {
		throw new TypeError(
			'schema handle cannot execute through another application',
		)
	}
	return immutableRecord({ ...options, ultimabase })
}

/** Owns native schema commands, schema mutations, and immutable model binding behavior. */
export class ApplicationSchemaHandleBase<
	TSchema extends SchemaDefinition = SchemaDefinition,
> {
	readonly schema: TSchema

	constructor(
		private readonly lifetime: ApplicationHandleLifetime,
		private readonly ultimabase: NonNullable<OperationOptions['ultimabase']>,
		private readonly surface: CompiledApplicationSchemaSurface,
		private readonly executeSchemaMutation: ApplicationSchemaMutationExecutor,
	) {
		this.schema = surface.schema as TSchema
		const state: ApplicationSchemaModelViewState = {
			mergeOptions: (options) => mergeApplicationOptions(options, ultimabase),
			modelViews: new WeakMap(),
			surface,
			executeSchemaMutation,
		}
		registerApplicationSchemaModelViewHost(this, state)
		Object.freeze(this)
		const handle = new Proxy(this, {
			get: (target, property, receiver): unknown => {
				if (typeof property === 'string') {
					if (target.surface.schemaMutations.has(property)) {
						return target.createSchemaMutationMethod(property)
					}
				}
				if (
					typeof property === 'string' &&
					schemaCommandNames.has(property) &&
					!Reflect.has(target, property)
				) {
					return (...arguments_: readonly unknown[]) =>
						target.invokeSchemaCommand(property, arguments_)
				}
				return Reflect.get(target, property, receiver)
			},
			has: (target, property): boolean =>
				(typeof property === 'string' &&
					target.surface.schemaMutations.has(property)) ||
				Reflect.has(target, property),
		})
		registerApplicationSchemaModelViewHost(handle, state)
		return handle
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

	private invokeSchemaCommand(
		name: string,
		arguments_: readonly unknown[],
	): unknown {
		assertHandleAvailable(this.lifetime)
		const command: unknown = Reflect.get(this.schema, name)
		if (typeof command !== 'function') {
			throw new TypeError(`Schema command is unavailable: ${name}`)
		}
		if (arguments_.length > 2) {
			throw new TypeError(
				`Schema command ${name} accepts at most two arguments`,
			)
		}
		const input = arguments_[0]
		const options = mergeApplicationOptions(arguments_[1], this.ultimabase)
		return Reflect.apply(command, this.schema, [input, options])
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
		return new Proxy(this, {
			get: (target, property, receiver): unknown => {
				if (
					typeof property === 'string' &&
					target.surface.modelMutations.has(property)
				) {
					return target.createSchemaMutationMethod(property)
				}
				return Reflect.get(target, property, receiver)
			},
			has: (target, property): boolean =>
				(typeof property === 'string' &&
					target.surface.modelMutations.has(property)) ||
				Reflect.has(target, property),
		})
	}

	private createSchemaMutationMethod(name: string) {
		const command: CompiledSchemaMutationCommand | undefined =
			this.surface.modelMutations.get(name)
		if (command === undefined) {
			throw new TypeError(`Unknown ${this.schema.className} mutation: ${name}`)
		}
		return createApplicationSchemaMutationMethod({
			assertAvailable: () => {
				assertHandleAvailable(this.lifetime)
			},
			command,
			execute: this.executeSchemaMutation,
			model: this.model,
			name,
			schema: this.schema,
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
