import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import type { OperationOptions } from '../query/operations/options.js'
import { QueryBuilder } from '../query/query/query.js'
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
	type CompiledOperationCommand,
	type CompiledPluginOperation,
} from '../plugins/application-surface-registry.js'
import type {
	PluginOperationDefinition,
	PluginOperationInput,
	PluginOperationResult,
} from '../plugins/plugin-operations.js'
import { assertImmutableOperationValue } from '../plugins/plugin-operation-boundaries.js'
import type {
	QueryExtensionDefinition,
	QueryExtensionInput,
} from '../plugins/application-surface-declarations.js'
import type {
	UltimaBaseGeneratedOperations,
	UltimaBaseGeneratedSchemaSurfaces,
} from '../schema/type-info.js'
import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import type { PluginLifecycleState } from '../plugins/lifecycle-manager.js'
import {
	registerApplicationSchemaModelViewHost,
	type ApplicationSchemaModelViewState,
} from './application-model-views.js'
/** Exposes safe owner facts without plugin configuration or execution state. */
export interface ApplicationContributionOwner {
	readonly instanceId?: string
	readonly pluginId: string
	readonly version: string
}
/** Identifies the application, schema, or immutable model bound to an envelope. */
export type PluginOperationEnvelopeTarget =
	| Readonly<{ readonly kind: 'application' }>
	| Readonly<{ readonly kind: 'schema'; readonly schema?: string }>
	| Readonly<{
			readonly kind: 'model'
			readonly schema?: string
			readonly state?: 'draft' | 'persisted'
	  }>
/** Carries one validated logical operation without executing or exposing it. */
export interface PluginOperationEnvelope<
	TOperation extends PluginOperationDefinition = PluginOperationDefinition,
> {
	readonly kind: 'plugin-operation'
	readonly name: TOperation['name']
	readonly payload: PluginOperationInput<TOperation>
	readonly target: PluginOperationEnvelopeTarget
	readonly transaction: TOperation['transaction']
	readonly version: TOperation['version']
}
interface ApplicationHandleLifetime {
	readonly state: PluginLifecycleState
}
/** Retains the exact schema or model selected by an application-owned handle. */
export interface ApplicationOperationBinding {
	readonly model?: object
	readonly schema?: SchemaDefinition
}
/** Executes one prepared envelope through the facade's active RequestEngine. */
export type ApplicationOperationExecutor = (
	compiled: CompiledPluginOperation,
	binding: ApplicationOperationBinding,
	envelope: PluginOperationEnvelope,
) => Promise<unknown>
const applicationOperationExecutors = new WeakMap<
	ApplicationOperationHandle,
	ApplicationOperationExecutor
>()
const snapshotOwner = (
	owner: PluginSchemaContributionOwner,
): ApplicationContributionOwner =>
	immutableRecord({
		...(owner.instanceId === undefined ? {} : { instanceId: owner.instanceId }),
		pluginId: owner.pluginId,
		version: owner.version,
	})
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
		private readonly binding: ApplicationOperationBinding = {},
	) {
		this.#compiled = compiled
		this.definition = compiled.operation as TOperation
		this.owner = snapshotOwner(compiled.owner)
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
			this.binding,
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
		const modelRecord =
			this.binding.model === undefined
				? undefined
				: readSchemaModelRecord(this.binding.model)
		const target: PluginOperationEnvelopeTarget =
			this.definition.target === 'application'
				? immutableRecord({ kind: 'application' as const })
				: this.definition.target === 'schema'
					? immutableRecord({
							kind: 'schema' as const,
							...(this.binding.schema === undefined
								? {}
								: { schema: this.binding.schema.className }),
						})
					: immutableRecord({
							kind: 'model' as const,
							...(this.binding.schema === undefined
								? {}
								: { schema: this.binding.schema.className }),
							...(modelRecord?.state === 'draft' ||
							modelRecord?.state === 'persisted'
								? { state: modelRecord.state }
								: {}),
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

type GeneratedSchemaCommands<TSchema extends SchemaDefinition> =
	SurfacePart<TSchema, 'schemaCommands'> extends infer TCommands extends
		Readonly<Record<string, string>>
		? {
				readonly [TName in keyof TCommands]: ApplicationOperationHandle<
					GeneratedOperation<TCommands[TName]>
				>
			}
		: Readonly<Record<never, never>>

type GeneratedModelCommands<TSchema extends SchemaDefinition> =
	SurfacePart<TSchema, 'modelCommands'> extends infer TCommands extends
		Readonly<Record<string, string>>
		? {
				readonly [TName in keyof TCommands]: ApplicationOperationHandle<
					GeneratedOperation<TCommands[TName]>
				>
			}
		: Readonly<Record<never, never>>

type GeneratedQueries<TSchema extends SchemaDefinition> =
	SurfacePart<TSchema, 'queries'> extends infer TQueries extends Readonly<
		Record<string, QueryExtensionDefinition>
	>
		? {
				readonly [TName in keyof TQueries]: (
					input: QueryExtensionInput<TQueries[TName]>,
				) => QueryBuilder<TSchema>
			}
		: Readonly<Record<never, never>>

/** Represents one schema through an application, without a constructible class. */
export type ApplicationSchemaHandle<
	TSchema extends SchemaDefinition = SchemaDefinition,
> = CoreSchemaHandleCommands<TSchema> &
	ApplicationSchemaHandleBase<TSchema> &
	SurfacePart<TSchema, 'schema'> &
	GeneratedSchemaCommands<TSchema> &
	GeneratedQueries<TSchema> &
	Readonly<{
		commands: GeneratedSchemaCommands<TSchema>
		queries: GeneratedQueries<TSchema>
	}>

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

/** Owns dynamic schema, command, query, and immutable model binding behavior. */
export class ApplicationSchemaHandleBase<
	TSchema extends SchemaDefinition = SchemaDefinition,
> {
	readonly commands: Readonly<Record<string, ApplicationOperationHandle>>
	readonly queries: Readonly<
		Record<string, (input: unknown) => QueryBuilder<SchemaDefinition>>
	>
	readonly schema: TSchema

	constructor(
		private readonly lifetime: ApplicationHandleLifetime,
		private readonly ultimabase: NonNullable<OperationOptions['ultimabase']>,
		private readonly surface: CompiledApplicationSchemaSurface,
		private readonly resolveOperation: (
			operation: PluginOperationDefinition,
			binding?: ApplicationOperationBinding,
		) => ApplicationOperationHandle,
	) {
		this.schema = surface.schema as TSchema
		this.commands = immutableRecord(
			Object.fromEntries(
				[...surface.schemaCommands].map(([name, command]) => [
					name,
					this.createCommandHandle(command),
				]),
			),
		)
		this.queries = immutableRecord(
			Object.fromEntries(
				[...surface.queryExtensions].map(([name]) => [
					name,
					(input: unknown) => this.query(name, input),
				]),
			),
		)
		const state: ApplicationSchemaModelViewState = {
			mergeOptions: (options) => mergeApplicationOptions(options, ultimabase),
			modelViews: new WeakMap(),
			resolveOperation,
			surface,
		}
		registerApplicationSchemaModelViewHost(this, state)
		Object.freeze(this)
		const handle = new Proxy(this, {
			get: (target, property, receiver): unknown => {
				if (typeof property === 'string') {
					if (target.surface.schemaCommands.has(property)) {
						return target.command(property)
					}
					if (target.surface.queryExtensions.has(property)) {
						return (input: unknown) => target.query(property, input)
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
		})
		registerApplicationSchemaModelViewHost(handle, state)
		return handle
	}

	/** Resolves one schema command alias to its inert operation handle. */
	command(name: string): ApplicationOperationHandle {
		assertHandleAvailable(this.lifetime)
		const command = this.surface.schemaCommands.get(name)
		if (command === undefined) {
			throw new TypeError(
				`Unknown ${this.schema.className} schema command: ${name}`,
			)
		}
		return this.createCommandHandle(command)
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
			this.resolveOperation,
		) as ApplicationModelHandleFor<TSchema>
	}

	/** Applies one validated QueryBuilder extension without entering Runtime. */
	query(name: string, input: unknown): QueryBuilder<SchemaDefinition> {
		assertHandleAvailable(this.lifetime)
		const query = this.surface.queryExtensions.get(name)
		if (query === undefined) {
			throw new TypeError(
				`Unknown ${this.schema.className} query extension: ${name}`,
			)
		}
		const snapshot = query.extension.input.snapshot(
			input,
			`${query.extension.name}.input`,
		)
		assertImmutableOperationValue(snapshot, `${query.extension.name}.input`)
		const result = query.extension.apply(this.schema, snapshot)
		if (!(result instanceof QueryBuilder) || result.schema !== this.schema) {
			throw new TypeError(
				`Query extension ${query.extension.name} must return a query for ${this.schema.className}`,
			)
		}
		return result
	}

	private createCommandHandle(
		command: CompiledOperationCommand,
	): ApplicationOperationHandle {
		return this.resolveOperation(command.operation, { schema: this.schema })
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
	readonly commands: Readonly<Record<string, ApplicationOperationHandle>>

	constructor(
		private readonly lifetime: ApplicationHandleLifetime,
		readonly schema: TSchema,
		readonly model: object,
		readonly state: Extract<SchemaModelState, 'draft' | 'persisted'>,
		private readonly surface: CompiledApplicationSchemaSurface,
		private readonly resolveOperation: (
			operation: PluginOperationDefinition,
			binding?: ApplicationOperationBinding,
		) => ApplicationOperationHandle,
	) {
		this.commands = immutableRecord(
			Object.fromEntries(
				[...surface.modelCommands].map(([name, command]) => [
					name,
					this.createCommandHandle(command),
				]),
			),
		)
		Object.freeze(this)
		return new Proxy(this, {
			get: (target, property, receiver): unknown =>
				typeof property === 'string' &&
				target.surface.modelCommands.has(property)
					? target.command(property)
					: Reflect.get(target, property, receiver),
		})
	}

	/** Resolves one model command alias while retaining protected model identity. */
	command(name: string): ApplicationOperationHandle {
		assertHandleAvailable(this.lifetime)
		const command = this.surface.modelCommands.get(name)
		if (command === undefined) {
			throw new TypeError(
				`Unknown ${this.schema.className} model command: ${name}`,
			)
		}
		return this.createCommandHandle(command)
	}

	private createCommandHandle(
		command: CompiledOperationCommand,
	): ApplicationOperationHandle {
		return this.resolveOperation(command.operation, {
			model: this.model,
			schema: this.schema,
		})
	}
}

/** Resolves exact generated direct methods for one immutable model handle. */
export type ApplicationModelHandleFor<TSchema extends SchemaDefinition> =
	ApplicationModelHandle<TSchema> &
		SurfacePart<TSchema, 'model'> &
		GeneratedModelCommands<TSchema> &
		Readonly<{ commands: GeneratedModelCommands<TSchema> }>

/** Resolves one exact generated operation from its stable namespaced name. */
export type ApplicationOperationHandleForName<TName extends string> =
	ApplicationOperationHandle<GeneratedOperation<TName>>

/** Resolves an exact schema reference from a generated literal name. */
export type ApplicationSchemaHandleForName<TClassName extends string> =
	ApplicationSchemaHandle<SchemaReference<TClassName>>
