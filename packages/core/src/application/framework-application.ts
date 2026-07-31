import { SchemaRegistry, type SchemaDefinition } from '@ultimabase/schema'
import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'

import {
	type PluginDefinition,
	type PluginExports,
} from '../plugins/definition.js'
import { PluginGraph } from '../plugins/graph.js'
import {
	PluginLifecycleManager,
	type PluginLifecycleState,
} from '../plugins/lifecycle-manager.js'
import { normalizePlugins } from '../plugins/normalization.js'
import { PluginSetupRegistries } from '../plugins/setup-registries.js'

/** Recursively retains top-level and composition-nested plugin definitions. */
export type ConfiguredPlugin<TPlugins extends readonly PluginDefinition[]> =
	readonly PluginDefinition[] extends TPlugins
		? PluginDefinition
		: TPlugins[number] extends infer TPlugin
			? TPlugin extends PluginDefinition
				? | TPlugin
					| ConfiguredPlugin<
							Extract<TPlugin['plugins'], readonly PluginDefinition[]>
					  >
				: never
			: never

/** Lists the literal names addressable through one application configuration. */
export type ConfiguredPluginName<TPlugins extends readonly PluginDefinition[]> =
	ConfiguredPlugin<TPlugins>['name']

/** Resolves setup exports for one configured literal plugin name. */
export type ConfiguredPluginExports<
	TPlugins extends readonly PluginDefinition[],
	TName extends ConfiguredPluginName<TPlugins>,
> =
	string extends ConfiguredPluginName<TPlugins>
		? unknown
		: PluginExports<
				Extract<ConfiguredPlugin<TPlugins>, { readonly name: TName }>
			>

/** Captures every static input needed to construct one isolated application. */
export interface FrameworkApplicationOptions<
	TSchemas extends readonly SchemaDefinition[],
	TPlugins extends readonly PluginDefinition[],
> {
	readonly schemas: TSchemas
	readonly plugins: TPlugins
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
	readonly #lifecycle: PluginLifecycleManager

	constructor(options: FrameworkApplicationOptions<TSchemas, TPlugins>) {
		const untrustedOptions: unknown = options

		assertApplicationOptions(untrustedOptions)

		this.schemas = new SchemaRegistry(options.schemas)

		const graph = new PluginGraph(normalizePlugins(options.plugins))
		const setupRegistries = new PluginSetupRegistries(this.schemas)

		this.#lifecycle = new PluginLifecycleManager(graph, setupRegistries)

		// Public application identity is stable while private lifecycle state may advance.
		Object.freeze(this)
	}

	get state(): PluginLifecycleState {
		return this.#lifecycle.state
	}

	/** Completes declaration-only plugin setup before the application is returned. */
	async initialize(): Promise<this> {
		await this.#lifecycle.setup()

		return this
	}

	/** Starts infrastructure through the deterministic plugin lifecycle. */
	start(): Promise<void> {
		return this.#lifecycle.start()
	}

	/** Stops active infrastructure without releasing setup-owned state. */
	stop(): Promise<void> {
		return this.#lifecycle.stop()
	}

	/** Permanently releases plugin and service resources owned by this application. */
	dispose(): Promise<void> {
		return this.#lifecycle.dispose()
	}

	/** Retrieves one plugin's setup output by its exact configured name. */
	getPlugin<const TName extends ConfiguredPluginName<TPlugins>>(
		pluginName: TName,
	): ConfiguredPluginExports<TPlugins, TName> {
		// The public return type restores the tuple relationship erased by the lifecycle map.
		return this.#lifecycle.getPluginExports(pluginName)
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
