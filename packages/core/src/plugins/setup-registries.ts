import type { SchemaRegistry } from '../schema/index.js'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
} from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import {
	createPluginHookRegistry,
	resolvePluginHookTargets,
	type PluginHookRegistry,
} from './hook-targets.js'
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

/** Names every setup contribution category addressable after initialization. */
export type PluginContributionCategory =
	| 'commands'
	| 'events'
	| 'extensions'
	| 'generators'
	| 'hooks'
	| 'operators'
	| 'pipelines'
	| 'transports'

/** Exposes one contribution category while binding writes to the current plugin. */
export interface PluginContributionRegistry {
	readonly size: number
	register(name: string, value: unknown): void
	has(name: string): boolean
	get(name: string): PluginContribution | undefined
	values(): readonly PluginContribution[]
}

type PluginLocalContributionRegistrar = (
	ownerPlugin: string,
	name: string,
	value: unknown,
) => void

// The typed hook facade reaches plugin-local storage without widening the public class API.
const pluginLocalContributionRegistrars = new WeakMap<
	ContributionRegistry,
	PluginLocalContributionRegistrar
>()

/** Stores one named contribution category for exactly one application. */
export class ContributionRegistry {
	readonly #contributions = new Map<string, PluginContribution>()
	readonly #ownerLocalIdentities = new Set<string>()

	constructor() {
		pluginLocalContributionRegistrars.set(
			this,
			(ownerPlugin, name, value): void => {
				this.#registerPluginLocal(ownerPlugin, name, value)
			},
		)
	}

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

	#registerPluginLocal(
		ownerPlugin: string,
		name: string,
		value: unknown,
	): void {
		assertNonEmptyString(ownerPlugin, 'pluginName')
		assertNonEmptyString(name, 'contribution name')
		const identity = this.#ownerLocalIdentity(ownerPlugin, name)

		this.#assertOwnerLocalIdentityAvailable(ownerPlugin, name, identity)
		// A length-prefixed private key cannot collide with user-supplied names.
		const storageKey = `\u0000${String(ownerPlugin.length)}:${ownerPlugin}${name}`
		this.#contributions.set(
			storageKey,
			immutableRecord({ name, ownerPlugin, value }),
		)
		this.#ownerLocalIdentities.add(identity)
	}

	#registerOwnedContribution(
		ownerPlugin: string,
		name: string,
		value: unknown,
	): void {
		assertNonEmptyString(name, 'contribution name')
		const identity = this.#ownerLocalIdentity(ownerPlugin, name)
		this.#assertOwnerLocalIdentityAvailable(ownerPlugin, name, identity)

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
		this.#ownerLocalIdentities.add(identity)
	}

	#ownerLocalIdentity(ownerPlugin: string, name: string): string {
		return `${String(ownerPlugin.length)}:${ownerPlugin}${name}`
	}

	#assertOwnerLocalIdentityAvailable(
		ownerPlugin: string,
		name: string,
		identity: string,
	): void {
		if (!this.#ownerLocalIdentities.has(identity)) {
			return
		}

		throw new FrameworkError(
			'PLUGIN_CONFLICT',
			`Plugin "${ownerPlugin}" already registered contribution "${name}".`,
			{
				internalDetails: {
					kind: 'duplicate-plugin-local-contribution',
					contributionName: name,
					ownerPlugin,
				},
			},
		)
	}
}

const registerPluginLocalContribution = (
	registry: ContributionRegistry,
	ownerPlugin: string,
	name: string,
	value: unknown,
): void => {
	const register = pluginLocalContributionRegistrars.get(registry)

	if (register === undefined) {
		throw new TypeError('Unknown contribution registry')
	}

	register(ownerPlugin, name, value)
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
	/** Registers native hooks with ownership fixed to the current setup plugin. */
	readonly hooks: PluginHookRegistry
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
	readonly #contributionRegistries: Readonly<
		Record<PluginContributionCategory, ContributionRegistry>
	>
	readonly #contexts = new Map<string, PluginSetupContext>()
	#setupOpen = true
	#hookTargetsResolved = false

	constructor(
		readonly schemas: SchemaRegistry,
		services: ServiceRegistry = new ServiceRegistry(),
	) {
		this.services = services
		this.#contributionRegistries = immutableRecord({
			commands: this.commands,
			events: this.events,
			extensions: this.extensions,
			generators: this.generators,
			hooks: this.hooks,
			operators: this.operators,
			pipelines: this.pipelines,
			transports: this.transports,
		})
	}

	/** Returns an immutable insertion-ordered snapshot without exposing scoped writes. */
	getContributions(
		category: PluginContributionCategory,
	): readonly PluginContribution[] {
		assertNonEmptyString(category, 'contribution category')

		if (!Object.hasOwn(this.#contributionRegistries, category)) {
			throw new TypeError(`Unknown contribution category: ${category}`)
		}

		return this.#contributionRegistries[category].values()
	}

	/** Closes typed setup-only facades before any infrastructure lifecycle phase. */
	closeSetup(): void {
		this.#setupOpen = false
	}

	/** Resolves native hook selectors after every setup declaration is available. */
	resolveHookTargets(): void {
		if (this.#setupOpen) {
			throw new TypeError('Plugin hook targets require completed setup')
		}

		if (this.#hookTargetsResolved) {
			return
		}

		resolvePluginHookTargets(this.schemas, this.hooks.values())
		this.#hookTargetsResolved = true
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
			hooks: createPluginHookRegistry({
				isOpen: (): boolean => this.#setupOpen,
				ownerPlugin: pluginName,
				register: (name: string, value: unknown): void => {
					registerPluginLocalContribution(this.hooks, pluginName, name, value)
				},
			}),
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
