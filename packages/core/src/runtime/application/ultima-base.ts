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
import { createConfiguredSchemaNamespace } from '../../schema/schema/schema-declaration-chain.js'
import type { ConfiguredSchemaNamespace } from '../../schema/schema/definition.js'

import type { PluginSchemaMutationEnvelope } from '../../application/application-schema-mutations.js'
import type { CompiledSchemaMutationCommand } from '../../plugins/application-surface-contracts.js'
import { getActiveRequestEngine } from '../context/active-framework-context.js'
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
import { checkApplicationHealth } from './application-health.js'
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
const configuredSchemaNamespace = createConfiguredSchemaNamespace(new Map())

let readKernel: <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState,
>(
	ultimabase: UltimaBase<TSchemas, TPlugins, TSource>,
) => FrameworkApplication<TSchemas, TPlugins>
let readEngine: <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState,
>(
	ultimabase: UltimaBase<TSchemas, TPlugins, TSource>,
) => FrameworkEngine<TSchemas, TPlugins>

export class UltimaBase<
	const TSchemas extends readonly SchemaDefinition[] =
		readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[] = readonly [],
	TSource extends PluginSourceState = EmptyPluginSourceState,
> {
	/** Declares portable schemas through the zero-plugin source factory. */
	static readonly Schema: ConfiguredSchemaNamespace = configuredSchemaNamespace

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
		this.#engineOptions = readEngineOptions(options)
		this.#operationOwnerToken = registerQueryExecutionOwner({
			application: this.#application,
			bindResult: (value, ownerToken) =>
				this.#bindQueryResult(value, ownerToken),
			executeModelSchemaMutation: (model, schema, name, input, options) =>
				this.#invokeSchemaMutation(
					schema,
					name,
					'model',
					(handle) => handle.for(model),
					input,
					options,
				),
			executeSchemaMutation: (schema, name, input, options) =>
				this.#invokeSchemaMutation(
					schema,
					name,
					'schema',
					(handle) => handle,
					input,
					options,
				),
			// The facade-owned anonymous engine validates exact schema ownership.
			createRootExecutor: () => this.#anonymousEngine(this.#frameworkEngine),
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
		return bindDirectApplicationValue(value, ownerToken, (schema) => {
			const surface = this.#application.ownsSchema(schema)
				? this.#application.getSchemaSurface(schema.className)
				: undefined
			return new Set(surface?.modelMutations.keys() ?? [])
		})
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
		if (
			typeof nameOrClass !== 'string' &&
			(!Schema.is(nameOrClass) || surface.schema !== nameOrClass)
		) {
			throw new TypeError(
				`Schema class does not belong to this application: ${className}`,
			)
		}
		let handle = this.#schemaHandles.get(className)
		if (handle === undefined) {
			handle = new ApplicationSchemaHandleBase(
				this,
				surface,
				(command, schema, envelope, options) =>
					this.#executeSchemaMutation(command, schema, envelope, options),
			)
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
		const { state } = this.#application
		if (
			state === 'stopping' ||
			state === 'stopped' ||
			state === 'disposing' ||
			state === 'disposed'
		) {
			throw new TypeError(
				`Cannot start UltimaBase while application is ${state}`,
			)
		}

		return this.#application.start(() => {
			if (
				readApplicationKernelState(this.#application).capabilityContributions(
					databaseAdapterCapability,
				).length > 0
			) {
				this.#frameworkEngine = createFrameworkEngine(
					this.#application,
					this.#engineOptions,
				)
			}
		})
	}

	/**
	 * Reports `OK` when the application is started and its database answers
	 * within two seconds, `DEGRADED` otherwise (not started, stopping, failure,
	 * timeout). Never throws; the cause is logged server-side only.
	 *
	 * @example `const status = await ultimabase.health() // 'OK' | 'DEGRADED'`
	 */
	health(): Promise<'OK' | 'DEGRADED'> {
		const started = this.#application.state === 'started'
		return checkApplicationHealth(
			started,
			started
				? readApplicationKernelState(this.#application).capability(
						databaseAdapterCapability,
					)
				: undefined,
		)
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

	/** Creates one fresh internal anonymous request for root application calls. */
	#anonymousEngine(
		framework: FrameworkEngine<TSchemas, TPlugins> = this.#engine,
	): RequestEngine<TSchemas, TPlugins> {
		return framework.anonymous({
			requestId: randomUUID(),
			source: requestSources.internal,
		})
	}

	/** Reuses this application's active request or opens a fresh internal one. */
	#requestEngine(): RequestEngine {
		const active = getActiveRequestEngine()
		return active?.ultimabase === this ? active : this.#anonymousEngine()
	}

	/** Calls one installed handle mutation after exact surface ownership checks. */
	#invokeSchemaMutation(
		schema: SchemaDefinition,
		name: string,
		target: 'model' | 'schema',
		select: (handle: ApplicationSchemaHandle) => object,
		input: unknown,
		options: OperationOptions | undefined,
	): Promise<unknown> {
		const surface = this.#application.getSchemaSurface(schema.className)
		const installed =
			target === 'model' ? surface?.modelMutations : surface?.schemaMutations
		const handle =
			surface?.schema === schema && installed?.has(name) === true
				? select(this.schema(schema))
				: undefined
		const method: unknown =
			handle === undefined ? undefined : Reflect.get(handle, name)
		if (handle === undefined || typeof method !== 'function') {
			throw new TypeError(
				`${target === 'model' ? 'Model' : 'Schema'} mutation ${schema.className}.${name} is not installed in this application`,
			)
		}
		return Reflect.apply(method, handle, [input, options]) as Promise<unknown>
	}

	async #executePluginOperation(
		compiled: CompiledOperationCommand,
		envelope: PluginOperationEnvelope,
	): Promise<unknown> {
		return this.#bindQueryResult(
			await executeRequestPluginOperation(
				this.#requestEngine(),
				compiled,
				envelope,
			),
			this.#operationOwnerToken,
		)
	}

	async #executeSchemaMutation(
		command: CompiledSchemaMutationCommand,
		schema: SchemaDefinition,
		envelope: PluginSchemaMutationEnvelope,
		options: OperationOptions | undefined,
	): Promise<unknown> {
		return this.#bindQueryResult(
			await executeRequestSchemaMutation(
				this.#requestEngine(),
				readMutationCommand(command).command,
				schema,
				envelope,
				normalizeOperationOptions(options),
			),
			this.#operationOwnerToken,
		)
	}

	static {
		readKernel = (ultimabase) => ultimabase.#application
		readEngine = (ultimabase) => {
			const engine = ultimabase.#frameworkEngine
			if (engine === undefined) {
				throw new TypeError('UltimaBase Runtime engine is unavailable')
			}
			return engine
		}
	}
}

/** @internal Resolves private Core state without exposing another public owner. */
export const readUltimaBaseKernel = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState,
>(
	ultimabase: UltimaBase<TSchemas, TPlugins, TSource>,
): FrameworkApplication<TSchemas, TPlugins> => readKernel(ultimabase)

/** @internal Reads the private Runtime engine after successful assembly. */
export const readUltimaBaseEngine = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState,
>(
	ultimabase: UltimaBase<TSchemas, TPlugins, TSource>,
): FrameworkEngine<TSchemas, TPlugins> => readEngine(ultimabase)
