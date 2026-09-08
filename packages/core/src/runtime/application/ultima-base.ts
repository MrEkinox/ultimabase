import { randomUUID } from 'node:crypto'

import {
	FrameworkApplication,
	type FrameworkApplicationOptions,
	type PluginDefinition,
} from '../../foundation.js'
import { registerQueryExecutionOwner } from '../../query/operations/execution.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { Schema } from '../../schema/index.js'
import { immutableArray, isPlainRecord } from '@ultimabase/shared'
import { findSchemaModelRecord } from '../../schema/schema/model-state.js'
import type { PluginOperationDefinition } from '../../plugins/plugin-operations.js'
import type { CompiledPluginOperation } from '../../plugins/application-surface-registry.js'
import {
	ApplicationOperationHandle,
	ApplicationSchemaHandleBase,
	registerApplicationOperationExecutor,
	type ApplicationOperationBinding,
	type ApplicationOperationHandleForName,
	type ApplicationSchemaHandle,
	type ApplicationSchemaHandleForName,
	type PluginOperationEnvelope,
} from '../../application/application-handles.js'
import { bindApplicationSchemaModel } from '../../application/application-model-views.js'

import { requestSources } from '../context/request-context.js'
import { getActiveFrameworkContext } from '../context/active-framework-storage.js'
import type { FrameworkEngine } from '../engine/framework-engine.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import type {
	ApplicationOperationTransport,
	OperationTransportExposureOptions,
} from '../plugin-operations/transport.js'
import { executeRequestPluginOperation } from '../plugin-operations/request-execution.js'
import {
	createFrameworkEngine,
	normalizeCreateFrameworkEngineOptions,
	type CreateFrameworkEngineOptions,
} from './create-framework-engine.js'

const ultimaBaseOptionKeys = new Set([
	'access',
	'masterAuthority',
	'pluginPrivileges',
	'plugins',
	'schemas',
	'validation',
])

/** Configures one complete framework facade without starting infrastructure. */
export interface UltimaBaseOptions<
	TSchemas extends readonly SchemaDefinition[],
	TPlugins extends readonly PluginDefinition[],
>
	extends
		FrameworkApplicationOptions<TSchemas, TPlugins>,
		CreateFrameworkEngineOptions {
	/**
	 * Registers the exact immutable schemas owned by this UltimaBase instance.
	 *
	 * @example `schemas: [UserSchema, PostSchema]`
	 */
	readonly schemas: TSchemas
	/**
	 * Declares top-level plugins; nested plugins join the same global graph.
	 *
	 * @example `plugins: [databasePlugin(), transportPlugin()]`
	 */
	readonly plugins: TPlugins
	/** Configures plugin privilege policy and startup reporting. */
	readonly pluginPrivileges?: NonNullable<
		FrameworkApplicationOptions<TSchemas, TPlugins>['pluginPrivileges']
	>
	/**
	 * Supplies the optional audited authority used for explicit master access.
	 *
	 * @example `masterAuthority: new MasterAuthority({ keys, onUse })`
	 */
	readonly masterAuthority?: NonNullable<
		CreateFrameworkEngineOptions['masterAuthority']
	>
	/**
	 * Configures structural validation, application time, and UUID generation.
	 *
	 * @example `validation: { timezone: "Europe/Paris" }`
	 */
	readonly validation?: NonNullable<CreateFrameworkEngineOptions['validation']>
}

const assertUltimaBaseOptions: (
	options: unknown,
) => asserts options is UltimaBaseOptions<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
> = (options) => {
	if (!isPlainRecord(options)) {
		throw new TypeError('UltimaBase options must be a plain object')
	}

	for (const key of Object.keys(options)) {
		if (!ultimaBaseOptionKeys.has(key)) {
			throw new TypeError(`UltimaBase contains unknown option: ${key}`)
		}
	}
}

const readEngineOptions = <
	TSchemas extends readonly SchemaDefinition[],
	TPlugins extends readonly PluginDefinition[],
>(
	options: UltimaBaseOptions<TSchemas, TPlugins>,
): Readonly<CreateFrameworkEngineOptions> =>
	normalizeCreateFrameworkEngineOptions({
		...(options.masterAuthority === undefined
			? {}
			: { masterAuthority: options.masterAuthority }),
		...(options.validation === undefined
			? {}
			: { validation: options.validation }),
	})

/**
 * Owns one isolated UltimaBase application and its Runtime engine.
 *
 * Construction validates and snapshots static configuration without opening
 * connections. Call `start()` before using direct queries.
 *
 * @example
 * ```ts
 * const ultimabase = new UltimaBase({
 *   schemas: [PostSchema],
 *   plugins: [postgresPlugin({ url: env.DATABASE_URL })],
 * })
 *
 * await ultimabase.start()
 * const posts = await PostSchema.findMany(undefined, { ultimabase })
 * ```
 */
export class UltimaBase<
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
> {
	/** Exposes the Core composition boundary for advanced plugin and service access. */
	readonly application: FrameworkApplication<TSchemas, TPlugins>
	readonly #engineOptions: Readonly<CreateFrameworkEngineOptions>
	#frameworkEngine: FrameworkEngine<TSchemas, TPlugins> | undefined
	#startPromise: Promise<void> | undefined
	readonly #operationHandles = new Map<string, ApplicationOperationHandle>()
	readonly #schemaHandles = new Map<string, ApplicationSchemaHandle>()

	constructor(options: UltimaBaseOptions<TSchemas, TPlugins>) {
		const untrustedOptions: unknown = options

		assertUltimaBaseOptions(untrustedOptions)

		this.application = new FrameworkApplication({
			...(options.pluginPrivileges === undefined
				? {}
				: { pluginPrivileges: options.pluginPrivileges }),
			schemas: options.schemas,
			plugins: options.plugins,
		})
		this.#engineOptions = readEngineOptions(options)
		registerQueryExecutionOwner(this, {
			application: this.application,
			bindResult: (value) => this.#bindQueryResult(value),
			createRootExecutor: () => {
				const frameworkEngine = this.#frameworkEngine ?? this.engine
				const requestEngine = frameworkEngine.anonymous({
					requestId: randomUUID(),
					source: requestSources.internal,
				})

				// The facade-owned anonymous engine validates exact schema ownership.
				return requestEngine
			},
		})

		// Public facade identity is stable while private lifecycle state may advance.
		Object.freeze(this)
	}

	/** Reports the exact lifecycle state owned by the underlying application. */
	get state(): FrameworkApplication<TSchemas, TPlugins>['state'] {
		return this.application.state
	}

	/** Exposes the started Runtime engine for transports and advanced request binding. */
	get engine(): FrameworkEngine<TSchemas, TPlugins> {
		if (
			this.#frameworkEngine === undefined ||
			this.application.state !== 'started'
		) {
			throw new TypeError(
				'UltimaBase must be started before accessing its engine',
			)
		}

		return this.#frameworkEngine
	}

	/** Resolves one inert application operation handle by stable token. */
	operation<TOperation extends PluginOperationDefinition>(
		operation: TOperation,
	): ApplicationOperationHandle<TOperation>
	/** Resolves one dynamic operation handle by its namespaced JavaScript name. */
	operation<const TName extends string>(
		name: TName,
	): ApplicationOperationHandleForName<TName>
	operation(
		tokenOrName: PluginOperationDefinition | string,
	): ApplicationOperationHandle {
		const name =
			typeof tokenOrName === 'string' ? tokenOrName : tokenOrName.name
		const compiled = this.application.getOperation(name)
		if (compiled === undefined) {
			throw new TypeError(`Unknown application operation: ${name}`)
		}
		if (typeof tokenOrName !== 'string' && compiled.operation !== tokenOrName) {
			throw new TypeError(
				`Operation token is not installed in this application: ${name}`,
			)
		}
		let handle = this.#operationHandles.get(name)
		if (handle === undefined) {
			handle = new ApplicationOperationHandle(this, compiled)
			registerApplicationOperationExecutor(
				handle,
				(compiledOperation, binding, envelope) =>
					this.#executePluginOperation(compiledOperation, binding, envelope),
			)
			this.#operationHandles.set(name, handle)
		}
		return handle
	}

	/** Reuses one application-owned immutable view for every Runtime model result. */
	#bindQueryResult(value: unknown): unknown {
		if (Array.isArray(value)) {
			return immutableArray(value.map((entry) => this.#bindQueryResult(entry)))
		}
		if (typeof value !== 'object' || value === null) {
			return value
		}
		const record = findSchemaModelRecord(value)
		if (record === undefined) {
			return value
		}
		const handle = this.schema(record.schema)
		return bindApplicationSchemaModel(handle, value)
	}

	/** Resolves one exact stable schema class through its application-owned handle. */
	schema<TSchema extends SchemaDefinition>(
		schema: TSchema,
	): ApplicationSchemaHandle<TSchema>
	/** Resolves one dynamic or generated literal schema name through the same handle. */
	schema<const TClassName extends string>(
		className: TClassName,
	): ApplicationSchemaHandleForName<TClassName>
	schema(nameOrClass: SchemaDefinition | string): ApplicationSchemaHandle {
		const className =
			typeof nameOrClass === 'string' ? nameOrClass : nameOrClass.className
		const surface = this.application.getSchemaSurface(className)
		if (surface === undefined) {
			throw new TypeError(`Unknown application schema: ${className}`)
		}
		if (typeof nameOrClass !== 'string') {
			if (!Schema.is(nameOrClass) || surface.schema !== nameOrClass) {
				throw new TypeError(
					`Schema class does not belong to this application: ${className}`,
				)
			}
		}
		let handle = this.#schemaHandles.get(className)
		if (handle === undefined) {
			const schemaHandle = new ApplicationSchemaHandleBase(
				this,
				this,
				surface,
				(operation, binding) => {
					const compiled = this.application.getOperation(operation.name)
					if (compiled?.operation !== operation) {
						throw new TypeError(
							`Operation token is not installed in this application: ${operation.name}`,
						)
					}
					const operationHandle = new ApplicationOperationHandle(
						this,
						compiled,
						binding,
					)
					registerApplicationOperationExecutor(
						operationHandle,
						(compiledOperation, operationBinding, envelope) =>
							this.#executePluginOperation(
								compiledOperation,
								operationBinding,
								envelope,
							),
					)
					return operationHandle
				},
			)
			handle = schemaHandle
			this.#schemaHandles.set(className, handle)
		}
		return handle
	}

	/** Selects the exact custom operations one public transport may execute. */
	exposeOperations<const TTransport extends OperationTransportProtocol>(
		options: OperationTransportExposureOptions<TTransport>,
	): ApplicationOperationTransport<TTransport> {
		return this.engine.exposeOperations(options)
	}

	/** Initializes plugins, assembles Runtime, and starts infrastructure exactly once. */
	start(): Promise<void> {
		if (
			this.application.state === 'stopping' ||
			this.application.state === 'stopped' ||
			this.application.state === 'disposing' ||
			this.application.state === 'disposed'
		) {
			throw new TypeError(
				`Cannot start UltimaBase while application is ${this.application.state}`,
			)
		}

		this.#startPromise ??= this.#performStart()

		return this.#startPromise
	}

	/** Stops active infrastructure without releasing setup-owned resources. */
	stop(): Promise<void> {
		return this.application.stop()
	}

	/** Permanently releases every plugin and service owned by this instance. */
	dispose(): Promise<void> {
		return this.application.dispose()
	}

	/** Integrates the facade with explicit resource-management scopes. */
	async [Symbol.asyncDispose](): Promise<void> {
		await this.dispose()
	}

	async #performStart(): Promise<void> {
		try {
			await this.application.initialize()
			const frameworkEngine = createFrameworkEngine(
				this.application,
				this.#engineOptions,
			)

			await this.application.start()
			this.#frameworkEngine = frameworkEngine
		} catch (error: unknown) {
			try {
				await this.application.dispose()
			} catch (cleanupError: unknown) {
				throw new AggregateError(
					[error, cleanupError],
					'UltimaBase startup failed and cleanup reported an additional error.',
					{ cause: cleanupError },
				)
			}

			throw error
		}
	}

	async #executePluginOperation(
		compiled: CompiledPluginOperation,
		binding: ApplicationOperationBinding,
		envelope: PluginOperationEnvelope,
	): Promise<unknown> {
		const active = getActiveFrameworkContext()
		const requestEngine =
			active?.application === this.application
				? active.requestEngine
				: this.engine.anonymous({
						requestId: randomUUID(),
						source: requestSources.internal,
					})
		return executeRequestPluginOperation(
			requestEngine,
			compiled,
			binding,
			envelope,
		)
	}
}
