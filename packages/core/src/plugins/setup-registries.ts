import type { SchemaRegistry } from '@ultimabase/schema'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
} from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import {
	ServiceRegistry,
	type PluginServiceRegistry,
} from '../services/service-registry.js'

/** Records immutable setup metadata together with the plugin that contributed it. */
export interface PluginContribution {
	readonly name: string
	readonly ownerPlugin: string
	readonly value: unknown
}

/** Exposes one contribution category while binding writes to the current plugin. */
export interface PluginContributionRegistry {
	readonly size: number
	register(name: string, value: unknown): void
	has(name: string): boolean
	get(name: string): PluginContribution | undefined
	values(): readonly PluginContribution[]
}

/** Stores one named contribution category for exactly one application. */
export class ContributionRegistry {
	readonly #contributions = new Map<string, PluginContribution>()

	get size(): number {
		return this.#contributions.size
	}

	forPlugin(pluginName: string): PluginContributionRegistry {
		assertNonEmptyString(pluginName, 'pluginName')
		const getSize = (): number => this.size

		return Object.freeze({
			get size(): number {
				return getSize()
			},
			register: (name: string, value: unknown): void => {
				this.#registerOwnedContribution(pluginName, name, value)
			},
			has: (name: string): boolean => this.has(name),
			get: (name: string): PluginContribution | undefined => this.get(name),
			values: (): readonly PluginContribution[] => this.values(),
		})
	}

	has(name: string): boolean {
		assertNonEmptyString(name, 'contribution name')

		return this.#contributions.has(name)
	}

	get(name: string): PluginContribution | undefined {
		assertNonEmptyString(name, 'contribution name')

		return this.#contributions.get(name)
	}

	values(): readonly PluginContribution[] {
		return immutableArray([...this.#contributions.values()])
	}

	#registerOwnedContribution(
		ownerPlugin: string,
		name: string,
		value: unknown,
	): void {
		assertNonEmptyString(name, 'contribution name')

		const existingContribution = this.#contributions.get(name)

		if (existingContribution !== undefined) {
			throw new FrameworkError(
				'PLUGIN_CONFLICT',
				`Contribution "${name}" is already owned by plugin "${existingContribution.ownerPlugin}".`,
				{
					internalDetails: {
						kind: 'duplicate-contribution',
						contributionName: name,
						pluginNames: immutableArray([
							existingContribution.ownerPlugin,
							ownerPlugin,
						]),
					},
				},
			)
		}

		this.#contributions.set(name, immutableRecord({ name, ownerPlugin, value }))
	}
}

/** Groups every non-service contribution category exposed during plugin setup. */
export interface PluginContributionRegistries {
	readonly extensions: PluginContributionRegistry
	readonly operators: PluginContributionRegistry
	readonly hooks: PluginContributionRegistry
	readonly generators: PluginContributionRegistry
	readonly transports: PluginContributionRegistry
	readonly pipelines: PluginContributionRegistry
	readonly events: PluginContributionRegistry
	readonly commands: PluginContributionRegistry
}

/** Supplies one plugin with application state and owner-bound contribution views. */
export interface PluginSetupContext {
	readonly schemas: SchemaRegistry
	readonly services: PluginServiceRegistry
	readonly registries: PluginContributionRegistries
}

/** Owns all mutable setup registries for one isolated application instance. */
export class PluginSetupRegistries {
	readonly services: ServiceRegistry
	readonly extensions: ContributionRegistry = new ContributionRegistry()
	readonly operators: ContributionRegistry = new ContributionRegistry()
	readonly hooks: ContributionRegistry = new ContributionRegistry()
	readonly generators: ContributionRegistry = new ContributionRegistry()
	readonly transports: ContributionRegistry = new ContributionRegistry()
	readonly pipelines: ContributionRegistry = new ContributionRegistry()
	readonly events: ContributionRegistry = new ContributionRegistry()
	readonly commands: ContributionRegistry = new ContributionRegistry()
	readonly #contexts = new Map<string, PluginSetupContext>()

	constructor(
		readonly schemas: SchemaRegistry,
		services: ServiceRegistry = new ServiceRegistry(),
	) {
		this.services = services
	}

	/** Returns one stable owner-bound setup context for a plugin name. */
	forPlugin(pluginName: string): PluginSetupContext {
		assertNonEmptyString(pluginName, 'pluginName')

		const existingContext = this.#contexts.get(pluginName)

		if (existingContext !== undefined) {
			return existingContext
		}

		const context = immutableRecord({
			schemas: this.schemas,
			services: this.services.forPlugin(pluginName),
			registries: immutableRecord({
				extensions: this.extensions.forPlugin(pluginName),
				operators: this.operators.forPlugin(pluginName),
				hooks: this.hooks.forPlugin(pluginName),
				generators: this.generators.forPlugin(pluginName),
				transports: this.transports.forPlugin(pluginName),
				pipelines: this.pipelines.forPlugin(pluginName),
				events: this.events.forPlugin(pluginName),
				commands: this.commands.forPlugin(pluginName),
			}),
		})

		this.#contexts.set(pluginName, context)

		return context
	}
}
