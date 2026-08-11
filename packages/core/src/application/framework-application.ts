import {
	Schema,
	SchemaRegistry,
	type SchemaDefinition,
	type SchemaTargetGraph,
} from '../schema/index.js'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	type PluginDefinition,
	runPluginFieldBuilderDeclaration,
} from '../plugins/definition.js'
import { validateExtensionHandlers } from '../plugins/extension-handlers.js'
import { PluginGraph } from '../plugins/graph.js'
import {
	PluginLifecycleManager,
	type PluginLifecycleState,
} from '../plugins/lifecycle-manager.js'
import { normalizePlugins } from '../plugins/normalization.js'
import type { PluginIdentity } from '../plugins/manifest.js'
import { PluginSetupRegistries } from '../plugins/setup-registries.js'
import type {
	PluginContribution,
	PluginContributionCategory,
} from '../plugins/setup-registries.js'
import type { ServiceToken } from '../services/service-token.js'
import { compileApplicationAccessPlan } from '../schema/access/plan.js'
import {
	FieldBuilderMethodRegistry,
	type OwnedFieldBuilderMethod,
} from '../schema/schema/field-builder-methods.js'
import type {
	ConfiguredPluginExports,
	ConfiguredPluginId,
	ConfiguredPluginIdentity,
	ConfiguredPluginIdentityExports,
} from './configured-plugins.js'
import {
	assertPluginPrivilegesAllowed,
	emitPluginPrivilegeReport,
	evaluatePluginPrivilegePolicy,
	type PluginPrivilegePolicy,
	type PluginPrivilegeReport,
} from './plugin-privilege-policy.js'

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
	/**
	 * Configures the fallback used only when no matching Access rule exists.
	 * @example `access: { default: { operation: false, field: true } }`
	 */
	readonly access?: FrameworkAccessOptions
	/** Configures cumulative plugin privilege and environment-claim denials. */
	readonly pluginPrivileges?: PluginPrivilegePolicy<TPlugins>
}

/** Distinguishes undeclared operation and field decisions when required. */
export interface FrameworkAccessDefaultPolicy {
	readonly field: boolean
	readonly operation: boolean
}

/** Accepts one concise fallback or one complete level-specific policy. */
export interface FrameworkAccessOptions {
	/**
	 * Applies one fallback to both levels or requires both explicit branches.
	 * @default true
	 * @example `default: false`
	 */
	readonly default?: boolean | FrameworkAccessDefaultPolicy
}

const allowAllAccessDefaults: FrameworkAccessDefaultPolicy = immutableRecord({
	field: true,
	operation: true,
})

const normalizeAccessDefaults = (
	access: unknown,
): FrameworkAccessDefaultPolicy => {
	if (access === undefined) {
		return allowAllAccessDefaults
	}

	if (!isPlainRecord(access)) {
		throw new TypeError('application access must be a plain object')
	}

	for (const key of Reflect.ownKeys(access)) {
		if (key !== 'default') {
			throw new TypeError(`Unknown application Access option: ${String(key)}`)
		}
	}

	const defaultPolicy: unknown = access.default

	if (defaultPolicy === undefined) {
		return allowAllAccessDefaults
	}

	if (typeof defaultPolicy === 'boolean') {
		return immutableRecord({
			field: defaultPolicy,
			operation: defaultPolicy,
		})
	}

	if (!isPlainRecord(defaultPolicy)) {
		throw new TypeError(
			'application access.default must be a boolean or plain object',
		)
	}

	for (const key of Reflect.ownKeys(defaultPolicy)) {
		if (key !== 'field' && key !== 'operation') {
			throw new TypeError(`Unknown application Access default: ${String(key)}`)
		}
	}

	if (typeof defaultPolicy.operation !== 'boolean') {
		throw new TypeError(
			'application access.default.operation must be a boolean',
		)
	}

	if (typeof defaultPolicy.field !== 'boolean') {
		throw new TypeError('application access.default.field must be a boolean')
	}

	return immutableRecord({
		field: defaultPolicy.field,
		operation: defaultPolicy.operation,
	})
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
	readonly accessDefaults: FrameworkAccessDefaultPolicy
	/** Exposes the detached policy result evaluated before every plugin effect. */
	readonly pluginPrivilegeReport: PluginPrivilegeReport
	readonly #setupRegistries: PluginSetupRegistries
	readonly #lifecycle: PluginLifecycleManager
	readonly #pluginGraph: PluginGraph
	readonly #fieldBuilderMethods = new FieldBuilderMethodRegistry()
	#schemaCompilationState: 'compiled' | 'compiling' | 'failed' | 'idle' = 'idle'
	#schemaCompilationError: unknown
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
		emitPluginPrivilegeReport(privilegePolicy.logger, privilegePolicy.report)
		assertPluginPrivilegesAllowed(privilegePolicy.report)

		this.schemas = new SchemaRegistry(options.schemas)
		this.accessDefaults = normalizeAccessDefaults(options.access)
		this.#pluginGraph = graph
		this.#setupRegistries = new PluginSetupRegistries(
			this.schemas,
			undefined,
			() => this.fieldBuilderMethods,
		)

		this.#lifecycle = new PluginLifecycleManager(graph, this.#setupRegistries)

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

	/** Checks exact schema identity so Runtime engines cannot cross applications. */
	ownsSchema(schema: unknown): schema is TSchemas[number] {
		if (!Schema.is(schema)) {
			return false
		}

		const registeredSchema: unknown = this.schemas.get(schema.className)

		return registeredSchema === schema
	}

	/** Resolves one required setup-provided service without exposing registry mutation. */
	getService<TService>(token: ServiceToken<TService>): TService {
		this.#assertSetupResourceAvailable('services')

		return this.#setupRegistries.services.get(token)
	}

	/** Resolves one optional setup-provided service without exposing registry mutation. */
	getOptionalService<TService>(
		token: ServiceToken<TService>,
	): TService | undefined {
		this.#assertSetupResourceAvailable('services')

		return this.#setupRegistries.services.getOptional(token)
	}

	/** Reads completed plugin declarations without exposing owner-scoped writers. */
	getContributions(
		category: PluginContributionCategory,
	): readonly PluginContribution[] {
		this.#assertSetupResourceAvailable('contributions')

		return this.#setupRegistries.getContributions(category)
	}

	/** Keeps every setup-owned read boundary aligned with application lifecycle state. */
	#assertSetupResourceAvailable(resource: 'contributions' | 'services'): void {
		if (
			this.#lifecycle.state === 'idle' ||
			this.#lifecycle.state === 'setting-up'
		) {
			throw new TypeError(
				`Application ${resource} require completed plugin setup`,
			)
		}

		if (
			this.#lifecycle.state === 'disposing' ||
			this.#lifecycle.state === 'disposed'
		) {
			throw new TypeError(`Application ${resource} are no longer available`)
		}
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
			throw this.#schemaCompilationError
		}

		if (this.#schemaCompilationState === 'compiling') {
			throw new TypeError('Application schema compilation is already running')
		}

		this.#schemaCompilationState = 'compiling'

		try {
			for (const plugin of this.#pluginGraph) {
				runPluginFieldBuilderDeclaration(
					plugin.definition,
					this.#fieldBuilderMethods.forPlugin(
						plugin.definition.manifest.identity.pluginId,
					),
				)
			}

			this.#fieldBuilderMethods.close()
			this.schemas.compileSchemas(this.#fieldBuilderMethods)
			this.#schemaCompilationState = 'compiled'

			return this
		} catch (error: unknown) {
			this.#schemaCompilationError = error
			this.#schemaCompilationState = 'failed'

			throw error
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
			await this.#lifecycle.setup()
			validateExtensionHandlers(
				this.schemas.values(),
				this.#setupRegistries.extensions,
			)
			this.#setupRegistries.resolveHookTargets()
			this.#setupRegistries.resolveAccessTargets()
			compileApplicationAccessPlan(this)

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
}

/** Creates and validates one isolated application without starting infrastructure. */
export const createApplication = async <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	options: FrameworkApplicationOptions<TSchemas, TPlugins>,
): Promise<FrameworkApplication<TSchemas, TPlugins>> =>
	new FrameworkApplication(options).initialize()
