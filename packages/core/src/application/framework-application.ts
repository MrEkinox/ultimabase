import {
	acquireApplication,
	assertOutsideApplicationWork,
	closeApplicationExecution,
	drainApplicationWork,
	releaseApplication,
} from './active-application.js'
import {
	Schema,
	SchemaRegistry,
	type SchemaDefinition,
	type SchemaTargetGraph,
} from '../schema/index.js'
import { assertUniqueSharedEnumNames } from '../schema/schema/shared-enum-names.js'
import { isUnknownArray } from '@ultimabase/shared'

import { type PluginDefinition } from '../plugins/definition.js'
import {
	composeDeclarationCapabilities,
	hasPluginPrivilege,
} from '../plugins/capability-inventory.js'
import { ApplicationCapabilityHost } from '../plugins/capability-host.js'
import { PluginDeclarationHost } from '../plugins/declaration-host.js'
import { SchemaDeclarationRegistry } from '../plugins/schema-declaration-registry.js'
import { FrameworkError } from '../errors/framework-error.js'
import { PluginGraph } from '../plugins/graph.js'
import {
	PluginLifecycleManager,
	type PluginLifecycleState,
} from '../plugins/lifecycle-manager.js'
import { normalizePlugins } from '../plugins/normalization.js'
import {
	formatPluginIdentity,
	type PluginIdentity,
	type PluginPrivilege,
} from '../plugins/manifest.js'
import { PluginSetupRegistries } from '../plugins/setup-registries.js'
import { FieldBuilderMethodRegistry } from '../schema/schema/field-builder-method-registry.js'
import type {
	OwnedFieldBuilderMethod,
	OwnedPluginFieldType,
} from '../schema/schema/field-builder-methods.js'
import type {
	ConfiguredPluginExports,
	ConfiguredPluginId,
	ConfiguredPluginIdentity,
	ConfiguredPluginIdentityExports,
} from './configured-plugins.js'
import {
	evaluatePluginPrivilegePolicy,
	type PluginPrivilegePolicy,
	type PluginPrivilegeReport,
} from './plugin-privilege-policy.js'
import * as diagnostics from './plugin-privilege-diagnostics.js'
import {
	ApplicationLog,
	type LogLevel,
	type Logger,
} from './application-log.js'
import { formatStartupSummary } from './startup-summary.js'
import type {
	CompiledApplicationSchemaSurface,
	CompiledPluginOperation,
} from '../plugins/application-surface-contracts.js'
import type { CompiledTypegenGraph } from '../plugins/typegen-declarations.js'
import { PrivateStorageRegistry } from '../private-storage/registry.js'
import { configureApplicationPrivateStorage } from '../private-storage/runtime.js'
import { compileStaticRelationWhereDeclarations } from '../query/filters/relation-where-declaration.js'
import {
	ApplicationKernelState,
	bindApplicationKernelState,
	readApplicationKernelState,
} from './application-kernel-state.js'
import { assertPlainObject } from '../exact-object-validation.js'

/** Captures every static input needed to construct one isolated application. */
export interface FrameworkApplicationOptions<
	TSchemas extends readonly SchemaDefinition[],
	TPlugins extends readonly PluginDefinition[],
> {
	/**
	 * Registers the exact immutable schemas owned by this application.
	 *
	 * @example `schemas: [UserSchema, PostSchema]`
	 */
	readonly schemas: TSchemas
	/**
	 * Declares every plugin in one flat application-owned list.
	 *
	 * @example `plugins: [databasePlugin(), transportPlugin()]`
	 */
	readonly plugins: TPlugins
	/** Configures cumulative plugin privilege and environment-claim denials. */
	readonly pluginPrivileges?: PluginPrivilegePolicy<TPlugins>
	/**
	 * Receives Core and plugin log lines; the console by default, `false`
	 * silences everything (ADR-0313).
	 */
	readonly logger?: Logger | false
	/** Lowest level written to the logger. @default 'info' */
	readonly logLevel?: LogLevel
}

const assertApplicationOptions: (
	options: unknown,
) => asserts options is FrameworkApplicationOptions<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
> = (options) => {
	assertPlainObject(options, 'application options must be a plain object')

	if (!isUnknownArray(options.schemas)) {
		throw new TypeError('schemas must be an array')
	}

	if (!isUnknownArray(options.plugins)) {
		throw new TypeError('plugins must be an array')
	}
}

/** Owns all schemas, plugin state, and lifecycle work for one application. */
export class FrameworkApplication<
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
> {
	readonly schemas: SchemaRegistry<TSchemas>
	/** Exposes the detached policy result evaluated before every plugin effect. */
	readonly pluginPrivilegeReport: PluginPrivilegeReport
	readonly #setupRegistries: PluginSetupRegistries
	readonly #lifecycle: PluginLifecycleManager
	readonly #capabilityHost: ApplicationCapabilityHost
	readonly #fieldBuilderMethods = new FieldBuilderMethodRegistry()
	readonly #schemaDeclarations = new SchemaDeclarationRegistry()
	readonly #declarationHost: PluginDeclarationHost
	readonly #privateStorage = new PrivateStorageRegistry()
	readonly #log: ApplicationLog
	#schemaCompilationState: 'compiled' | 'compiling' | 'failed' | 'idle' = 'idle'
	#schemaCompilationError: FrameworkError | undefined
	#initializePromise: Promise<this> | undefined
	#initializeFailed = false
	#startPromise: Promise<void> | undefined
	#startFailed = false
	#stopPromise: Promise<void> | undefined
	#disposePromise: Promise<void> | undefined
	#closing: 'stopping' | 'stopped' | 'disposing' | 'disposed' | undefined

	constructor(options: FrameworkApplicationOptions<TSchemas, TPlugins>) {
		const untrustedOptions: unknown = options

		assertApplicationOptions(untrustedOptions)

		this.#log = new ApplicationLog(options.logger, options.logLevel)
		const graph = new PluginGraph(normalizePlugins(options.plugins))
		const report = evaluatePluginPrivilegePolicy(
			graph,
			options.pluginPrivileges,
		)
		this.pluginPrivilegeReport = report
		diagnostics.emitPolicyReport(this.#log, report)
		diagnostics.assertPolicyAllowed(report)
		composeDeclarationCapabilities(graph.capabilities)

		this.schemas = new SchemaRegistry(options.schemas)
		assertUniqueSharedEnumNames(options.schemas)
		this.#declarationHost = new PluginDeclarationHost(
			graph,
			this.#fieldBuilderMethods,
			this.#schemaDeclarations,
			this.#privateStorage,
		)
		const capabilityHostReference: {
			current: ApplicationCapabilityHost | undefined
		} = { current: undefined }
		const assertPluginPrivilege = (
			owner: PluginIdentity,
			privilege: PluginPrivilege,
		): void => {
			if (!hasPluginPrivilege(graph.get(owner), privilege)) {
				throw new FrameworkError(
					'PLUGIN_PRIVILEGE_DENIED',
					`Plugin "${formatPluginIdentity(owner)}" requires privilege "${privilege}" for this Core facade.`,
					{
						internalDetails: diagnostics.missingPrivilegeDetails(
							owner,
							privilege,
						),
					},
				)
			}
		}
		const setupRegistries = new PluginSetupRegistries(
			this.schemas,
			() => this.fieldBuilderMethods,
			() => this.pluginFieldTypes,
			(owner) => {
				const host = capabilityHostReference.current
				if (host === undefined) {
					throw new TypeError('Application capability host is unavailable')
				}
				return host.forPlugin(owner)
			},
			() => this.#schemaDeclarations.typegenGraph(),
			(owner) => this.#log.forPlugin(owner),
		)
		const capabilityHost = new ApplicationCapabilityHost(
			graph,
			this.schemas,
			this,
			(className) => this.getSchemaSurface(className),
			() =>
				this.#schemaCompilationState === 'compiled'
					? this.#schemaDeclarations.commandGraph()
					: undefined,
		)
		this.#capabilityHost = capabilityHost
		capabilityHostReference.current = capabilityHost
		this.#setupRegistries = setupRegistries

		this.#lifecycle = new PluginLifecycleManager(
			graph,
			this.#setupRegistries,
			capabilityHost,
			this,
		)
		bindApplicationKernelState(
			this,
			new ApplicationKernelState({
				assertPrivilege: assertPluginPrivilege,
				capabilities: capabilityHost,
				log: this.#log,
				pluginExports: (plugin) => this.#lifecycle.getPluginExports(plugin),
				privateStorage: this.#privateStorage,
			}),
		)

		// Public application identity is stable while private lifecycle state may advance.
		Object.freeze(this)
	}

	get state(): PluginLifecycleState {
		return this.#closing ?? this.#lifecycle.state
	}

	/** Reads the immutable application-local relationship graph after static compilation. */
	get schemaTargets(): SchemaTargetGraph {
		return this.schemas.schemaTargets
	}

	/** Reads the immutable plugin method graph after static declaration completes. */
	get fieldBuilderMethods(): readonly OwnedFieldBuilderMethod[] {
		return this.#fieldBuilderMethods.values()
	}

	/** Reads plugin field value contracts without implying a public builder method. */
	get pluginFieldTypes(): readonly OwnedPluginFieldType[] {
		return this.#fieldBuilderMethods.fieldTypes()
	}

	/** Checks exact schema identity so Runtime engines cannot cross applications. */
	ownsSchema(schema: unknown): schema is TSchemas[number] {
		if (!Schema.is(schema)) {
			return false
		}

		const registeredSchema: unknown = this.schemas.get(schema.className)

		return registeredSchema === schema
	}

	/** Resolves one compiled application-owned schema surface by exact identity. */
	getSchemaSurface(
		className: string,
	): CompiledApplicationSchemaSurface | undefined {
		this.compileSchemas()
		return this.#schemaDeclarations.commandGraph().schemaSurface(className)
	}

	/** Resolves one inert custom operation declaration by its namespaced name. */
	getOperation(name: string): CompiledPluginOperation | undefined {
		this.compileSchemas()
		return this.#schemaDeclarations.commandGraph().operation(name)
	}

	/** Reads the complete callback-free graph used by declaration tooling. */
	get typegenGraph(): CompiledTypegenGraph {
		this.compileSchemas()
		return this.#schemaDeclarations.typegenGraph()
	}

	/** Adds private storage identity to fingerprints without exposing descriptors. */
	get privateStorageFingerprint(): string | undefined {
		this.compileSchemas()
		return this.#privateStorage.fingerprint()
	}

	/** Claims exclusive resource ownership before capability materialization and plugin setup. */
	initialize(): Promise<this> {
		if (this.#initializeFailed && this.#initializePromise !== undefined)
			return this.#initializePromise
		if (this.#closing !== undefined || this.#lifecycle.state === 'disposed') {
			return Promise.reject(
				new TypeError('Cannot initialize a closed application'),
			)
		}
		// Competing initialization rejects without disposing or changing its incumbent.
		try {
			acquireApplication(this)
		} catch (error: unknown) {
			return Promise.reject(
				error instanceof Error
					? error
					: new Error('Application activation failed', { cause: error }),
			)
		}
		this.#initializePromise ??= this.#performInitialize()

		return this.#initializePromise
	}

	/**
	 * Compiles the pure application schema graph without running plugin setup.
	 *
	 * Code generators use this boundary to inspect static declarations without
	 * opening services, adapters, transports, or another infrastructure resource.
	 */
	compileSchemas(): this {
		if (this.#schemaCompilationState === 'compiled') {
			return this
		}

		if (this.#schemaCompilationState === 'failed') {
			throw (
				this.#schemaCompilationError ??
				new TypeError('Application schema compilation failure is unavailable')
			)
		}

		if (this.#schemaCompilationState === 'compiling') {
			throw new TypeError('Application schema compilation is already running')
		}

		this.#schemaCompilationState = 'compiling'

		try {
			this.#declarationHost.run()
			this.#schemaDeclarations.compileSchemaRegistry(
				this.schemas,
				this.#fieldBuilderMethods,
			)
			compileStaticRelationWhereDeclarations(this.schemas)
			this.#privateStorage.close(this.schemas)
			readApplicationKernelState(this).publishCommands(
				this.#schemaDeclarations.commandGraph(),
			)
			this.#schemaCompilationState = 'compiled'

			return this
		} catch (error: unknown) {
			throw this.#recordSchemaCompilationFailure(error)
		}
	}

	/** Starts infrastructure through the deterministic plugin lifecycle. */
	start(beforeStart?: () => void): Promise<void> {
		if (this.#startFailed && this.#startPromise !== undefined)
			return this.#startPromise
		if (
			!this.#initializeFailed &&
			(this.#closing !== undefined || this.#lifecycle.state === 'disposed')
		) {
			return Promise.reject(new TypeError('Cannot start a closed application'))
		}
		this.#startPromise ??= this.#performStart(beforeStart)

		return this.#startPromise
	}

	/** Stops active infrastructure without releasing setup-owned state. */
	stop(): Promise<void> {
		assertOutsideApplicationWork(this)
		if (this.#disposePromise !== undefined) return this.#disposePromise
		if (this.#startPromise === undefined) return Promise.resolve()
		closeApplicationExecution(this)
		this.#closing ??= 'stopping'
		this.#stopPromise ??= this.#performStop()
		return this.#stopPromise
	}

	/** Drains admitted work and releases ownership only after successful resource cleanup. */
	dispose(): Promise<void> {
		assertOutsideApplicationWork(this)
		if (this.#disposePromise !== undefined) return this.#disposePromise
		closeApplicationExecution(this)
		this.#closing = 'disposing'
		this.#disposePromise = this.#performDispose()
		return this.#disposePromise
	}

	/** Retrieves one plugin's setup output when its stable ID is unambiguous. */
	getPlugin<const TPluginId extends ConfiguredPluginId<TPlugins>>(
		pluginId: TPluginId,
	): ConfiguredPluginExports<TPlugins, TPluginId>
	/** Retrieves one plugin instance's setup output by its exact structured identity. */
	getPlugin<const TIdentity extends ConfiguredPluginIdentity<TPlugins>>(
		identity: TIdentity,
	): ConfiguredPluginIdentityExports<TPlugins, TIdentity>
	getPlugin(identity: PluginIdentity | ConfiguredPluginId<TPlugins>): unknown {
		// The public return type restores the tuple relationship erased by the lifecycle map.
		return this.getPluginDynamic(identity)
	}

	/** @internal Resolves a dynamic identity after the public tuple overloads erase it. */
	getPluginDynamic(identity: PluginIdentity | string): unknown {
		return this.#lifecycle.getPluginExports(identity)
	}

	async #performInitialize(): Promise<this> {
		try {
			this.compileSchemas()
			await this.#capabilityHost.materialize()
			await configureApplicationPrivateStorage(this, this.#privateStorage)
			try {
				this.#schemaDeclarations.runRuntimeCompilers(this.#capabilityHost)
			} catch (error: unknown) {
				throw this.#recordSchemaCompilationFailure(error)
			}
			await this.#lifecycle.setup()
			return this
		} catch (error: unknown) {
			this.#initializeFailed = true
			if (this.#lifecycle.state !== 'disposed') {
				try {
					await this.#lifecycle.dispose()
				} catch (cleanupError: unknown) {
					throw new AggregateError(
						[error, cleanupError],
						'Application validation failed and cleanup reported an additional error.',
						{ cause: cleanupError },
					)
				}
			}

			this.#releaseIfClean()
			throw error
		}
	}

	async #performStart(beforeStart: (() => void) | undefined): Promise<void> {
		try {
			await this.initialize()
			beforeStart?.()
			await this.#lifecycle.start()
			this.#log.info(
				formatStartupSummary(this.schemas.size, this.pluginPrivilegeReport),
			)
		} catch (error: unknown) {
			this.#startFailed = true
			if (this.#lifecycle.state !== 'disposed') {
				try {
					await this.#lifecycle.dispose()
				} catch (cleanupError: unknown) {
					this.#closing = 'disposed'
					this.#releaseIfClean()
					throw new AggregateError(
						[error, cleanupError],
						'Application startup failed and cleanup reported an additional error.',
						{ cause: cleanupError },
					)
				}
			}
			this.#closing = 'disposed'
			this.#releaseIfClean()
			throw error
		}
	}

	async #performStop(): Promise<void> {
		try {
			await this.#startPromise
		} catch {
			return
		}
		await drainApplicationWork(this)
		try {
			await this.#lifecycle.stop()
		} finally {
			if (this.#closing === 'stopping') this.#closing = 'stopped'
		}
	}

	async #performDispose(): Promise<void> {
		// Initialization includes materialization outside PluginLifecycleManager.setup().
		try {
			await (this.#startPromise ?? this.#initializePromise)
		} catch {
			// The initiating caller retains its startup error; cleanup proof is separate.
		}
		if (this.#stopPromise !== undefined) {
			try {
				await this.#stopPromise
			} catch {
				/* Disposal still visits every resource. */
			}
		}
		await drainApplicationWork(this)
		try {
			await this.#lifecycle.dispose()
		} finally {
			this.#closing = 'disposed'
			this.#releaseIfClean()
		}
	}

	#releaseIfClean(): void {
		if (this.#lifecycle.cleanupComplete) {
			releaseApplication(this)
		}
	}

	#recordSchemaCompilationFailure(error: unknown): FrameworkError {
		if (this.#schemaCompilationError !== undefined) {
			return this.#schemaCompilationError
		}

		const reason =
			error instanceof Error ? error.message : 'Unknown declaration failure'
		const failure = new FrameworkError(
			'PLUGIN_DECLARATION_INVALID',
			`Plugin application declaration is invalid: ${reason}`,
			{
				cause: error,
				internalDetails: {
					kind: 'plugin-declaration-invalid',
					...this.#schemaDeclarations.diagnoseFailure(error),
				},
			},
		)
		this.#schemaCompilationError = failure
		this.#schemaCompilationState = 'failed'

		return failure
	}
}

/** Creates and validates one isolated application without starting infrastructure. */
export const createApplication = async <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	options: FrameworkApplicationOptions<TSchemas, TPlugins>,
): Promise<FrameworkApplication<TSchemas, TPlugins>> =>
	new FrameworkApplication(options).initialize()
