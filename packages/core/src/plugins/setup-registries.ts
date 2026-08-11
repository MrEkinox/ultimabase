import type {
	CompiledSchemaRegistry,
	OwnedFieldBuilderMethod,
	SchemaRegistry,
} from '../schema/index.js'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
} from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import {
	createPluginConstraintCompilerRegistry,
	type PluginConstraintCompilerRegistry,
} from './constraint-compilers.js'
import {
	createPluginHookRegistry,
	resolvePluginHookTargets,
	type PluginHookRegistry,
} from './hook-targets.js'
import {
	createPluginAccessRegistry,
	resolvePluginAccessTargets,
	type PluginAccessRegistry,
} from './access-targets.js'
import {
	ServiceRegistry,
	type PluginServiceRegistry,
} from '../services/service-registry.js'
import { formatPluginIdentity, type PluginIdentity } from './manifest.js'

const emptyFieldBuilderMethods: readonly OwnedFieldBuilderMethod[] =
	immutableArray([])

const toPluginIdentity = (owner: PluginIdentity | string): PluginIdentity => {
	if (typeof owner === 'string') {
		assertNonEmptyString(owner, 'pluginId')
		return immutableRecord({ pluginId: owner })
	}

	assertNonEmptyString(owner.pluginId, 'pluginId')
	if (owner.instanceId !== undefined) {
		assertNonEmptyString(owner.instanceId, 'instanceId')
	}

	return owner
}

/** Records immutable setup metadata together with the plugin that contributed it. */
export interface PluginContribution {
	readonly name: string
	readonly ownerPlugin: string
	readonly ownerInstanceId?: string
	readonly value: unknown
}

/** Names every setup contribution category addressable after initialization. */
export type PluginContributionCategory =
	| 'access'
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
	owner: PluginIdentity,
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
	readonly #orderedContributions: PluginContribution[] = []
	readonly #ownerLocalNames = new Map<
		string,
		Map<string | undefined, Set<string>>
	>()

	constructor() {
		pluginLocalContributionRegistrars.set(this, (owner, name, value): void => {
			this.#registerPluginLocal(owner, name, value)
		})
	}

	get size(): number {
		return this.#orderedContributions.length
	}

	forPlugin(ownerInput: PluginIdentity | string): PluginContributionRegistry {
		const owner = toPluginIdentity(ownerInput)
		const getSize = (): number => this.size

		return Object.freeze({
			get size(): number {
				return getSize()
			},
			register: (name: string, value: unknown): void => {
				this.#registerOwnedContribution(owner, name, value)
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
		return immutableArray(this.#orderedContributions)
	}

	#registerPluginLocal(
		owner: PluginIdentity,
		name: string,
		value: unknown,
	): void {
		assertNonEmptyString(name, 'contribution name')
		const names = this.#ownerLocalContributionNames(owner)

		this.#assertOwnerLocalIdentityAvailable(owner, name, names)
		this.#orderedContributions.push(
			immutableRecord({
				name,
				ownerPlugin: owner.pluginId,
				...(owner.instanceId === undefined
					? {}
					: { ownerInstanceId: owner.instanceId }),
				value,
			}),
		)
		names.add(name)
	}

	#registerOwnedContribution(
		owner: PluginIdentity,
		name: string,
		value: unknown,
	): void {
		assertNonEmptyString(name, 'contribution name')
		const names = this.#ownerLocalContributionNames(owner)
		this.#assertOwnerLocalIdentityAvailable(owner, name, names)

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
							owner.pluginId,
						]),
					},
				},
			)
		}

		const contribution = immutableRecord({
			name,
			ownerPlugin: owner.pluginId,
			...(owner.instanceId === undefined
				? {}
				: { ownerInstanceId: owner.instanceId }),
			value,
		})
		this.#contributions.set(name, contribution)
		this.#orderedContributions.push(contribution)
		names.add(name)
	}

	#ownerLocalContributionNames(owner: PluginIdentity): Set<string> {
		let instances = this.#ownerLocalNames.get(owner.pluginId)
		if (instances === undefined) {
			instances = new Map()
			this.#ownerLocalNames.set(owner.pluginId, instances)
		}

		let names = instances.get(owner.instanceId)
		if (names === undefined) {
			names = new Set()
			instances.set(owner.instanceId, names)
		}

		return names
	}

	#assertOwnerLocalIdentityAvailable(
		owner: PluginIdentity,
		name: string,
		names: ReadonlySet<string>,
	): void {
		if (!names.has(name)) {
			return
		}

		throw new FrameworkError(
			'PLUGIN_CONFLICT',
			`Plugin "${formatPluginIdentity(owner)}" already registered contribution "${name}".`,
			{
				internalDetails: {
					kind: 'duplicate-plugin-local-contribution',
					contributionName: name,
					ownerPlugin: owner.pluginId,
					...(owner.instanceId === undefined
						? {}
						: { ownerInstanceId: owner.instanceId }),
				},
			},
		)
	}
}

const registerPluginLocalContribution = (
	registry: ContributionRegistry,
	owner: PluginIdentity,
	name: string,
	value: unknown,
): void => {
	const register = pluginLocalContributionRegistrars.get(registry)

	if (register === undefined) {
		throw new TypeError('Unknown contribution registry')
	}

	register(owner, name, value)
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
	readonly schemas: CompiledSchemaRegistry
	/** Exposes the compiled application-local FieldBuilder method graph to tooling plugins. */
	readonly fieldBuilderMethods: readonly OwnedFieldBuilderMethod[]
	readonly services: PluginServiceRegistry
	readonly registries: PluginContributionRegistries
	/** Registers native Access policies with ownership fixed to this plugin. */
	readonly access: PluginAccessRegistry
	/** Registers native hooks with ownership fixed to the current setup plugin. */
	readonly hooks: PluginHookRegistry
	/** Registers adapter constraint compilers with owner-derived provenance. */
	readonly constraintCompilers: PluginConstraintCompilerRegistry
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
	// Access definitions stay behind their typed facade and cannot be forged through registries.
	readonly access: ContributionRegistry = new ContributionRegistry()
	// Compiler identities reuse contribution storage behind a narrower typed facade.
	readonly constraintCompilers: ContributionRegistry =
		new ContributionRegistry()
	readonly #contributionRegistries: Readonly<
		Record<PluginContributionCategory, ContributionRegistry>
	>
	readonly #contexts = new Map<
		string,
		Map<string | undefined, PluginSetupContext>
	>()
	#setupOpen = true
	#hookTargetsResolved = false
	#accessTargetsResolved = false

	constructor(
		readonly schemas: SchemaRegistry,
		services: ServiceRegistry = new ServiceRegistry(),
		readonly fieldBuilderMethods: () => readonly OwnedFieldBuilderMethod[] = () =>
			emptyFieldBuilderMethods,
	) {
		this.services = services
		this.#contributionRegistries = immutableRecord({
			access: this.access,
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
		if (!this.#setupOpen) {
			return
		}

		this.#setupOpen = false
		this.services.validateRequirements()
	}

	/** Closes setup after a plugin failure without masking the original error. */
	abortSetup(): void {
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

	/** Resolves native Access selectors after every setup declaration is available. */
	resolveAccessTargets(): void {
		if (this.#setupOpen) {
			throw new TypeError('Plugin Access targets require completed setup')
		}

		if (this.#accessTargetsResolved) {
			return
		}

		resolvePluginAccessTargets(this.schemas, this.access.values())
		this.#accessTargetsResolved = true
	}

	/** Returns one stable owner-bound setup context for a structured plugin identity. */
	forPlugin(ownerInput: PluginIdentity | string): PluginSetupContext {
		const owner = toPluginIdentity(ownerInput)
		let instances = this.#contexts.get(owner.pluginId)
		if (instances === undefined) {
			instances = new Map()
			this.#contexts.set(owner.pluginId, instances)
		}

		const existingContext = instances.get(owner.instanceId)

		if (existingContext !== undefined) {
			return existingContext
		}

		const context = immutableRecord({
			schemas: this.schemas,
			fieldBuilderMethods: this.fieldBuilderMethods(),
			services: this.services.forPlugin(formatPluginIdentity(owner)),
			access: createPluginAccessRegistry({
				isOpen: (): boolean => this.#setupOpen,
				ownerPlugin: owner.pluginId,
				register: (name: string, value: unknown): void => {
					registerPluginLocalContribution(this.access, owner, name, value)
				},
			}),
			constraintCompilers: createPluginConstraintCompilerRegistry({
				isOpen: (): boolean => this.#setupOpen,
				ownerPlugin: owner.pluginId,
				register: (name: string, value: unknown): void => {
					registerPluginLocalContribution(
						this.constraintCompilers,
						owner,
						name,
						value,
					)
				},
				values: () => this.constraintCompilers.values(),
			}),
			hooks: createPluginHookRegistry({
				isOpen: (): boolean => this.#setupOpen,
				ownerPlugin: owner.pluginId,
				register: (name: string, value: unknown): void => {
					registerPluginLocalContribution(this.hooks, owner, name, value)
				},
			}),
			registries: immutableRecord({
				extensions: this.extensions.forPlugin(owner),
				operators: this.operators.forPlugin(owner),
				hooks: this.hooks.forPlugin(owner),
				generators: this.generators.forPlugin(owner),
				transports: this.transports.forPlugin(owner),
				pipelines: this.pipelines.forPlugin(owner),
				events: this.events.forPlugin(owner),
				commands: this.commands.forPlugin(owner),
			}),
		})

		instances.set(owner.instanceId, context)

		return context
	}
}
