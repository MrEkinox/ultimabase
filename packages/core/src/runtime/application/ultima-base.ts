import { randomUUID } from 'node:crypto'

import { immutableRecord } from '@ultimabase/shared'
import type {
	AnonymousRequestAccess,
	RequestAccess,
} from '../../access/index.js'
import {
	ApplicationOperationHandle,
	ApplicationSchemaHandleBase,
	registerApplicationOperationExecutor,
	type ApplicationOperationHandleForName,
	type ApplicationSchemaHandle,
	type ApplicationSchemaHandleForName,
	type PluginOperationEnvelope,
} from '../../application/application-handles.js'
import { bindDirectApplicationValue } from '../../application/application-model-views.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import {
	type ConfiguredPluginExports,
	type ConfiguredPluginId,
	type ConfiguredPluginIdentity,
	type ConfiguredPluginIdentityExports,
	type PluginDefinition,
	type PluginExports,
} from '../../foundation.js'
import { FrameworkApplication } from '../../application/framework-application.js'
import type { PluginIdentity } from '../../plugins/manifest.js'
import type { PluginPrivilegeReport } from '../../application/plugin-privilege-policy.js'
import {
	readMutationCommand,
	type CompiledOperationCommand,
} from '../../plugins/command-graph.js'
import type { PluginOperationDefinition } from '../../plugins/plugin-operations.js'
import {
	normalizeOperationOptions,
	registerQueryExecutionOwner,
	type OperationExecutionOwnerToken,
} from '../../query/operations/execution.js'
import type { OperationOptions } from '../../query/operations/options.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { Schema } from '../../schema/index.js'
import { defineOrdinarySchemaModel } from '../../schema/schema/definition.js'
import type { ConfiguredSchemaNamespace } from '../../schema/schema/definition.js'

import type { PluginSchemaMutationEnvelope } from '../../application/application-schema-mutations.js'
import type { CompiledSchemaMutationCommand } from '../../plugins/application-surface-registry.js'
import { getActiveFrameworkContext } from '../context/active-framework-storage.js'
import { registerApplicationFacade } from '../context/current-ultima-base.js'
import { requestSources } from '../context/request-context.js'
import type {
	RequestContext,
	RequestContextOptions,
} from '../context/request-context.js'
import type {
	FrameworkEngine,
	RequestEngine,
} from '../engine/framework-engine.js'
import { databaseAdapterCapability } from '../database/contracts.js'
import type { MasterKeyGrant } from '../master/master-authority.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import { executeRequestPluginOperation } from '../plugin-operations/request-execution.js'
import type {
	ApplicationOperationTransport,
	OperationTransportExposureOptions,
} from '../plugin-operations/transport.js'
import { executeRequestSchemaMutation } from '../schema-mutations/request-execution.js'
import {
	createFrameworkEngine,
	type CreateFrameworkEngineOptions,
} from './create-framework-engine.js'
import {
	appendConfiguredPlugins,
	readConfiguredPlugins,
	type ConfiguredUltimaBaseFactory,
	type MergeInstalledPluginSources,
} from './configured-application-factory.js'
import {
	bindUltimaBaseEngine,
	bindUltimaBaseKernel,
} from './ultima-base-kernel.js'
import type {
	EmptyPluginSourceState,
	PluginSourceState,
} from '../../plugins/source-projections.js'
import {
	assertUltimaBaseOptions,
	readEngineOptions,
	type CompiledApplication,
	type RootUltimaBaseOptions,
} from './ultima-base-contracts.js'
export type {
	CompiledApplication,
	UltimaBaseInstanceOptions,
} from './ultima-base-contracts.js'

/**
 * Owns one isolated UltimaBase application and its Runtime engine.
 *
 * Construction validates and snapshots static configuration without opening
 * connections. Call `start()` before using direct queries.
 *
 * @example
 * ```ts
 * const Application = UltimaBase.use(
 *   postgresPlugin({ url: env.DATABASE_URL }),
 * )
 * const ultimabase = new Application({
 *   schemas: [PostSchema],
 * })
 *
 * await ultimabase.start()
 * const posts = await PostSchema.findMany()
 * ```
 */
const configuredSchemaNamespace = Object.freeze({
	define: defineOrdinarySchemaModel,
	defineSpecialized: Schema.defineSpecialized.bind(Schema),
	is: Schema.is.bind(Schema),
})

export class UltimaBase<
	const TSchemas extends readonly SchemaDefinition[] =
		readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[] = readonly [],
	TSource extends PluginSourceState = EmptyPluginSourceState,
> {
	/** Declares portable schemas through the zero-plugin source factory. */
	static readonly Schema: ConfiguredSchemaNamespace =
		configuredSchemaNamespace as unknown as ConfiguredSchemaNamespace

	/**
	 * Returns a new immutable factory with plugins appended to its flat graph.
	 *
	 * @example `const Application = UltimaBase.use(databasePlugin(), httpPlugin())`
	 */
	static use<const TInstalled extends readonly PluginDefinition[]>(
		...plugins: TInstalled
	): ConfiguredUltimaBaseFactory<
		readonly [...TInstalled],
		MergeInstalledPluginSources<EmptyPluginSourceState, TInstalled>
	> {
		return appendConfiguredPlugins<
			readonly [],
			EmptyPluginSourceState,
			TInstalled
		>(this, ...plugins)
	}

	readonly #application: FrameworkApplication<TSchemas, TPlugins>
	readonly #engineOptions: Readonly<CreateFrameworkEngineOptions>
	#frameworkEngine: FrameworkEngine<TSchemas, TPlugins> | undefined
	#compiledApplication: CompiledApplication<TSchemas> | undefined
	readonly #operationHandles = new Map<string, ApplicationOperationHandle>()
	readonly #operationOwnerToken: OperationExecutionOwnerToken
	readonly #schemaHandles = new Map<string, ApplicationSchemaHandle>()

	constructor(options: RootUltimaBaseOptions<TSchemas, TPlugins>) {
		const untrustedOptions: unknown = options

		assertUltimaBaseOptions(untrustedOptions)

		const plugins = readConfiguredPlugins(new.target) as TPlugins
		this.#application = new FrameworkApplication({
			...(options.pluginPrivileges === undefined
				? {}
				: { pluginPrivileges: options.pluginPrivileges }),
			schemas: options.schemas,
			plugins,
		})
		bindUltimaBaseKernel(this, this.#application)
		this.#engineOptions = readEngineOptions(options)
		this.#operationOwnerToken = registerQueryExecutionOwner({
			application: this.#application,
			bindResult: (value, ownerToken) =>
				this.#bindQueryResult(value, ownerToken),
			executeModelSchemaMutation: (model, schema, name, input, options) => {
				const surface = this.#application.getSchemaSurface(schema.className)
				if (surface?.schema !== schema || !surface.modelMutations.has(name)) {
					throw new TypeError(
						`Model mutation ${schema.className}.${name} is not installed in this application`,
					)
				}
				const handle = this.schema(schema).for(model)
				const method: unknown = Reflect.get(handle, name)
				if (typeof method !== 'function') {
					throw new TypeError(
						`Model mutation ${schema.className}.${name} is not installed in this application`,
					)
				}
				return Reflect.apply(method, handle, [
					input,
					options,
				]) as Promise<unknown>
			},
			executeSchemaMutation: (schema, name, input, options) => {
				const surface = this.#application.getSchemaSurface(schema.className)
				if (surface?.schema !== schema || !surface.schemaMutations.has(name)) {
					throw new TypeError(
						`Schema mutation ${schema.className}.${name} is not installed in this application`,
					)
				}
				const handle = this.schema(schema)
				const method: unknown = Reflect.get(handle, name)
				if (typeof method !== 'function') {
					throw new TypeError(
						`Schema mutation ${schema.className}.${name} is not installed in this application`,
					)
				}
				return Reflect.apply(method, handle, [
					input,
					options,
				]) as Promise<unknown>
			},
			createRootExecutor: () => {
				const frameworkEngine = this.#frameworkEngine ?? this.#engine
				const requestEngine = frameworkEngine.anonymous({
					requestId: randomUUID(),
					source: requestSources.internal,
				})

				// The facade-owned anonymous engine validates exact schema ownership.
				return requestEngine
			},
		})
		// Public facade identity is stable while private lifecycle state may advance.
		registerApplicationFacade(this, this.#application)
		Object.freeze(this)
	}

	/** Reports the exact lifecycle state owned by the underlying application. */
	get state(): FrameworkApplication<TSchemas, TPlugins>['state'] {
		return this.#application.state
	}

	/** Reads the detached privilege decision produced before any plugin effect. */
	get pluginPrivilegeReport(): PluginPrivilegeReport {
		return this.#application.pluginPrivilegeReport
	}

	get #engine(): FrameworkEngine<TSchemas, TPlugins> {
		if (
			this.#frameworkEngine === undefined ||
			this.#application.state !== 'started'
		) {
			throw new TypeError('UltimaBase must be started before request execution')
		}

		return this.#frameworkEngine
	}

	/** Compiles and returns the immutable application facts used by deterministic tooling. */
	compile(): CompiledApplication<TSchemas> {
		this.#application.compileSchemas()
		this.#compiledApplication ??= immutableRecord({
			fieldBuilderMethods: this.#application.fieldBuilderMethods,
			pluginFieldTypes: this.#application.pluginFieldTypes,
			pluginPrivilegeReport: this.#application.pluginPrivilegeReport,
			...(this.#application.privateStorageFingerprint === undefined
				? {}
				: {
						privateStorageFingerprint:
							this.#application.privateStorageFingerprint,
					}),
			schemas: this.#application.schemas,
			typegenGraph: this.#application.typegenGraph,
		})
		return this.#compiledApplication
	}

	/** Materializes capabilities and runs plugin setup without starting infrastructure. */
	async initialize(): Promise<this> {
		await this.#application.initialize()
		return this
	}

	/** Checks exact schema identity without exposing the private application kernel. */
	ownsSchema(schema: unknown): schema is TSchemas[number] {
		return this.#application.ownsSchema(schema)
	}

	/** Binds one validated request context to this started application. */
	withContext<TAccess extends RequestAccess, const TSource extends string>(
		context: RequestContext<TAccess, TSource>,
	): RequestEngine<TSchemas, TPlugins, RequestContext<TAccess, TSource>> {
		return this.#engine.withContext(context)
	}

	/** Creates one anonymous request boundary for direct server-side composition. */
	anonymous<const TSource extends string>(
		options: RequestContextOptions<TSource>,
	): RequestEngine<
		TSchemas,
		TPlugins,
		RequestContext<AnonymousRequestAccess, TSource>
	> {
		return this.#engine.anonymous(options)
	}

	/** Verifies one configured raw Master credential without retaining it. */
	authorizeMasterKey(rawKey: string): MasterKeyGrant {
		return this.#engine.authorizeMasterKey(rawKey)
	}

	/** Resolves one inert application operation handle by stable token. */
	operation<TOperation extends PluginOperationDefinition>(
		operation: TOperation,
	): ApplicationOperationHandle<TOperation>
	/** Resolves one source-projected operation installed on this configured factory. */
	operation<const TName extends Extract<keyof TSource['operations'], string>>(
		name: TName,
	): ApplicationOperationHandle<
		Extract<TSource['operations'][TName], PluginOperationDefinition>
	>
	/** Resolves one dynamic operation handle by its namespaced JavaScript name. */
	operation<const TName extends string>(
		name: TName,
	): ApplicationOperationHandleForName<TName>
	operation(
		tokenOrName: PluginOperationDefinition | string,
	): ApplicationOperationHandle {
		const name =
			typeof tokenOrName === 'string' ? tokenOrName : tokenOrName.name
		const compiled = this.#application.getOperation(name)
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
				(compiledOperation, envelope) =>
					this.#executePluginOperation(compiledOperation, envelope),
			)
			this.#operationHandles.set(name, handle)
		}
		return handle
	}

	/** Reuses one application-owned immutable view for every Runtime model result. */
	#bindQueryResult(
		value: unknown,
		ownerToken: OperationExecutionOwnerToken,
	): unknown {
		const modelMutationsBySchema = new Map<
			SchemaDefinition,
			ReadonlySet<string>
		>()
		for (const schema of this.#application.schemas.values()) {
			const surface = this.#application.getSchemaSurface(schema.className)
			modelMutationsBySchema.set(
				schema,
				new Set(surface?.modelMutations.keys() ?? []),
			)
		}
		return bindDirectApplicationValue(
			value,
			ownerToken,
			(schema) => modelMutationsBySchema.get(schema) ?? new Set<string>(),
		)
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
		const surface = this.#application.getSchemaSurface(className)
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
				surface,
				(command, schema, envelope, options) =>
					this.#executeSchemaMutation(command, schema, envelope, options),
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
		return this.#engine.exposeOperations(options)
	}

	/** Retrieves setup exports through the exact configured plugin definition. */
	plugin<const TPlugin extends PluginDefinition>(
		plugin: TPlugin,
	): PluginExports<TPlugin>
	plugin<const TPluginId extends ConfiguredPluginId<TPlugins>>(
		pluginId: TPluginId,
	): ConfiguredPluginExports<TPlugins, TPluginId>
	plugin<const TIdentity extends ConfiguredPluginIdentity<TPlugins>>(
		identity: TIdentity,
	): ConfiguredPluginIdentityExports<TPlugins, TIdentity>
	plugin(
		pluginOrIdentity: PluginDefinition | PluginIdentity | string,
	): unknown {
		return typeof pluginOrIdentity === 'object' &&
			'manifest' in pluginOrIdentity
			? readApplicationKernelState(this.#application).pluginExports(
					pluginOrIdentity,
				)
			: this.#application.getPluginDynamic(pluginOrIdentity)
	}

	/** Initializes plugins, assembles Runtime, and starts infrastructure exactly once. */
	start(): Promise<void> {
		if (
			this.#application.state === 'stopping' ||
			this.#application.state === 'stopped' ||
			this.#application.state === 'disposing' ||
			this.#application.state === 'disposed'
		) {
			throw new TypeError(
				`Cannot start UltimaBase while application is ${this.#application.state}`,
			)
		}

		return this.#application.start(() => {
			if (
				readApplicationKernelState(this.#application).capabilityContributions(
					databaseAdapterCapability,
				).length === 0
			) {
				return
			}
			const frameworkEngine = createFrameworkEngine(
				this.#application,
				this.#engineOptions,
			)
			bindUltimaBaseEngine(this, frameworkEngine)
			this.#frameworkEngine = frameworkEngine
		})
	}

	/** Stops active infrastructure without releasing setup-owned resources. */
	stop(): Promise<void> {
		return this.#application.stop()
	}

	/** Permanently releases every plugin and service owned by this instance. */
	dispose(): Promise<void> {
		return this.#application.dispose()
	}

	/** Integrates the facade with explicit resource-management scopes. */
	async [Symbol.asyncDispose](): Promise<void> {
		await this.dispose()
	}

	async #executePluginOperation(
		compiled: CompiledOperationCommand,
		envelope: PluginOperationEnvelope,
	): Promise<unknown> {
		const active = getActiveFrameworkContext()
		const requestEngine =
			active?.ultimabase === this
				? active.requestEngine
				: this.#engine.anonymous({
						requestId: randomUUID(),
						source: requestSources.internal,
					})
		return this.#bindQueryResult(
			await executeRequestPluginOperation(requestEngine, compiled, envelope),
			this.#operationOwnerToken,
		)
	}

	async #executeSchemaMutation(
		command: CompiledSchemaMutationCommand,
		schema: SchemaDefinition,
		envelope: PluginSchemaMutationEnvelope,
		options: OperationOptions | undefined,
	): Promise<unknown> {
		const active = getActiveFrameworkContext()
		const requestEngine =
			active?.ultimabase === this
				? active.requestEngine
				: this.#engine.anonymous({
						requestId: randomUUID(),
						source: requestSources.internal,
					})
		return this.#bindQueryResult(
			await executeRequestSchemaMutation(
				requestEngine,
				readMutationCommand(command).command,
				schema,
				envelope,
				normalizeOperationOptions(options),
			),
			this.#operationOwnerToken,
		)
	}
}
