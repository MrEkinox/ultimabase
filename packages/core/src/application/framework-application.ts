import {
	Schema,
	SchemaRegistry,
	type SchemaDefinition,
	type SchemaTargetGraph,
} from '../schema/index.js'
import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'

import { type PluginDefinition } from '../plugins/definition.js'
import { composeDeclarationCapabilities } from '../plugins/capability-inventory.js'
import {
	selectSchemaCompiler,
	type SelectedSchemaCompiler,
} from '../plugins/schema-compiler-ir/schema-compiler-selection.js'
import type { SchemaCompilerProvenance } from '../plugins/schema-compiler-ir/schema-compiler-capability.js'
import { ApplicationCapabilityHost } from '../plugins/capability-host.js'
import { PluginDeclarationHost } from '../plugins/declaration-host.js'
import { SchemaDeclarationRegistry } from '../plugins/schema-declarations.js'
import { bindApplicationCapabilityHost } from '../plugins/application-capability-access.js'
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
import {
	bindApplicationPluginPrivilegeAssertion,
	PluginSetupRegistries,
} from '../plugins/setup-registries.js'
import {
	FieldBuilderMethodRegistry,
	type OwnedFieldBuilderMethod,
} from '../schema/schema/field-builder-methods.js'
import type { OwnedPluginFieldType } from '../schema/schema/plugin-field-types.js'
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
import type {
	CompiledApplicationSchemaSurface,
	CompiledPluginOperation,
} from '../plugins/application-surface-registry.js'
import type { CompiledTypegenGraph } from '../plugins/typegen-declarations.js'

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
	 * Declares top-level plugins; nested plugins join the same global graph.
	 *
	 * @example `plugins: [postgresPlugin(), graphqlYogaPlugin()]`
	 */
	readonly plugins: TPlugins
	/** Configures cumulative plugin privilege and environment-claim denials. */
	readonly pluginPrivileges?: PluginPrivilegePolicy<TPlugins>
}

const assertApplicationOptions: (
	options: unknown,
) => asserts options is FrameworkApplicationOptions<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
> = (options) => {
	if (!isPlainRecord(options)) {
		throw new TypeError('application options must be a plain object')
	}

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
	/** Reports the exact complete schema compiler selected for this application. */
	readonly schemaCompilerProvenance: SchemaCompilerProvenance
	readonly #setupRegistries: PluginSetupRegistries
	readonly #lifecycle: PluginLifecycleManager
	readonly #capabilityHost: ApplicationCapabilityHost
	readonly #fieldBuilderMethods = new FieldBuilderMethodRegistry()
	readonly #schemaDeclarations = new SchemaDeclarationRegistry()
	readonly #declarationHost: PluginDeclarationHost
	readonly #schemaCompiler: SelectedSchemaCompiler
	#schemaCompilationState: 'compiled' | 'compiling' | 'failed' | 'idle' = 'idle'
	#schemaCompilationError: FrameworkError | undefined
	#initializePromise: Promise<this> | undefined
	#startPromise: Promise<void> | undefined

	constructor(options: FrameworkApplicationOptions<TSchemas, TPlugins>) {
		const untrustedOptions: unknown = options

		assertApplicationOptions(untrustedOptions)

		const graph = new PluginGraph(normalizePlugins(options.plugins))
		const privilegePolicy = evaluatePluginPrivilegePolicy(
			graph,
			options.pluginPrivileges,
		)
		this.pluginPrivilegeReport = privilegePolicy.report
		diagnostics.emitPolicyReport(privilegePolicy.logger, privilegePolicy.report)
		diagnostics.assertPolicyAllowed(privilegePolicy.report)
		composeDeclarationCapabilities(graph.capabilities)
		this.#schemaCompiler = selectSchemaCompiler(graph.capabilities)
		this.schemaCompilerProvenance = this.#schemaCompiler.provenance

		this.schemas = new SchemaRegistry(options.schemas)
		this.#declarationHost = new PluginDeclarationHost(
			graph,
			this.#fieldBuilderMethods,
			this.#schemaDeclarations,
		)
		const capabilityHostReference: {
			current: ApplicationCapabilityHost | undefined
		} = { current: undefined }
		const assertPluginPrivilege = (
			owner: PluginIdentity,
			privilege: PluginPrivilege,
		): void => {
			const plugin = graph.get(owner)
			const request = plugin?.definition.manifest.privileges.find(
				(candidate) => candidate.name === privilege,
			)

			if (
				plugin === undefined ||
				request === undefined ||
				!graph.capabilities.isPrivilegeActive(owner, request)
			) {
				throw new FrameworkError(
					'PLUGIN_PRIVILEGE_DENIED',
					`Plugin "${formatPluginIdentity(owner)}" requires active privilege "${privilege}" for this Core facade.`,
					{
						internalDetails: diagnostics.inactivePrivilegeDetails(
							owner,
							privilege,
							request?.reason,
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
			assertPluginPrivilege,
			() => this.#schemaDeclarations.typegenGraph(),
		)
		const capabilityHost = new ApplicationCapabilityHost(
			graph,
			this.schemas,
			setupRegistries.getConstraintCompilerReader(),
			this,
		)
		this.#capabilityHost = capabilityHost
		capabilityHostReference.current = capabilityHost
		bindApplicationCapabilityHost(this, capabilityHost)
		bindApplicationPluginPrivilegeAssertion(this, assertPluginPrivilege)
		this.#setupRegistries = setupRegistries

		this.#lifecycle = new PluginLifecycleManager(
			graph,
			this.#setupRegistries,
			capabilityHost,
			this,
		)

		// Public application identity is stable while private lifecycle state may advance.
		Object.freeze(this)
	}

	get state(): PluginLifecycleState {
		return this.#lifecycle.state
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
		return this.#schemaDeclarations.schemaSurface(className)
	}

	/** Resolves one inert custom operation declaration by its namespaced name. */
	getOperation(name: string): CompiledPluginOperation | undefined {
		this.compileSchemas()
		return this.#schemaDeclarations.operation(name)
	}

	/** Reads the complete callback-free graph used by declaration tooling. */
	get typegenGraph(): CompiledTypegenGraph {
		this.compileSchemas()
		return this.#schemaDeclarations.typegenGraph()
	}

	/** Completes declaration-only plugin setup before the application is returned. */
	initialize(): Promise<this> {
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
				this.#schemaCompiler.compile,
			)
			this.#schemaCompilationState = 'compiled'

			return this
		} catch (error: unknown) {
			throw this.#recordSchemaCompilationFailure(error)
		}
	}

	/** Starts infrastructure through the deterministic plugin lifecycle. */
	start(): Promise<void> {
		this.#startPromise ??= this.#performStart()

		return this.#startPromise
	}

	/** Stops active infrastructure without releasing setup-owned state. */
	stop(): Promise<void> {
		return this.#lifecycle.stop()
	}

	/** Permanently releases plugin and service resources owned by this application. */
	dispose(): Promise<void> {
		return this.#lifecycle.dispose()
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
		return this.#lifecycle.getPluginExports(identity)
	}

	async #performInitialize(): Promise<this> {
		try {
			this.compileSchemas()
			await this.#capabilityHost.materialize()
			try {
				this.#schemaDeclarations.runRuntimeCompilers(this.#capabilityHost)
			} catch (error: unknown) {
				throw this.#recordSchemaCompilationFailure(error)
			}
			await this.#lifecycle.setup()
			return this
		} catch (error: unknown) {
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

			throw error
		}
	}

	async #performStart(): Promise<void> {
		await this.initialize()
		await this.#lifecycle.start()
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
