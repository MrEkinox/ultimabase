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
import type { PluginCapabilityReader } from './capabilities.js'
import {
	createDatabaseConstraintCompilerReader,
	createPluginConstraintCompilerRegistry,
	type DatabaseConstraintCompilerReader,
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
	createPluginEventContributionHost,
	createPluginRuntimeContributionHost,
	createPluginRuntimePipelineHost,
	type PluginEventContributionHost,
	type PluginRuntimeContributionHost,
	type PluginRuntimePipelineHost,
} from './runtime-contribution-hosts.js'
import {
	formatPluginIdentity,
	type PluginIdentity,
	type PluginPrivilege,
} from './manifest.js'
import type { CompiledTypegenGraph } from './typegen-declarations.js'

const emptyFieldBuilderMethods: readonly OwnedFieldBuilderMethod[] =
	immutableArray([])
const emptyCapabilityReader: PluginCapabilityReader = immutableRecord({
	get: () => {
		throw new TypeError('No capability graph is configured')
	},
})
const emptyTypegenGraph: CompiledTypegenGraph = immutableRecord({
	declarations: immutableArray([]),
	operations: immutableArray([]),
	options: immutableArray([]),
	schemaSurfaces: immutableArray([]),
})

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

/** @internal Records immutable setup metadata with its structured owner. */
export interface OwnedPluginContribution {
	readonly name: string
	readonly ownerPlugin: string
	readonly ownerInstanceId?: string
	readonly value: unknown
}

/** @internal Stores one exact contribution protocol for one application. */
class OwnedContributionStore {
	readonly #contributions = new Map<string, OwnedPluginContribution>()
	readonly #orderedContributions: OwnedPluginContribution[] = []
	readonly #ownerLocalNames = new Map<
		string,
		Map<string | undefined, Set<string>>
	>()

	get size(): number {
		return this.#orderedContributions.length
	}

	has(name: string): boolean {
		assertNonEmptyString(name, 'contribution name')

		return this.#contributions.has(name)
	}

	get(name: string): OwnedPluginContribution | undefined {
		assertNonEmptyString(name, 'contribution name')

		return this.#contributions.get(name)
	}

	values(): readonly OwnedPluginContribution[] {
		return immutableArray(this.#orderedContributions)
	}

	registerLocal(owner: PluginIdentity, name: string, value: unknown): void {
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

	registerUnique(owner: PluginIdentity, name: string, value: unknown): void {
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

/** Supplies one plugin with application state and owner-bound contribution views. */
export interface PluginSetupContext {
	readonly schemas: CompiledSchemaRegistry
	/** Exposes the compiled application-local FieldBuilder method graph to tooling plugins. */
	readonly fieldBuilderMethods: readonly OwnedFieldBuilderMethod[]
	/** Exposes the callback-free final application graph to declaration tooling. */
	readonly typegenGraph: CompiledTypegenGraph
	/** Reads only exact capability requirements declared by this plugin. */
	readonly capabilities: PluginCapabilityReader
	/** Registers native Access policies with ownership fixed to this plugin. */
	readonly access: PluginAccessRegistry
	/** Registers native hooks with ownership fixed to the current setup plugin. */
	readonly hooks: PluginHookRegistry
	/** Registers adapter constraint compilers with owner-derived provenance. */
	readonly constraintCompilers: PluginConstraintCompilerRegistry
	/** Registers low-level Runtime interception and monotonic enforcement definitions. */
	readonly runtime: PluginRuntimeContributionHost
	/** Registers post-commit observers and named event consumers. */
	readonly events: PluginEventContributionHost
	/** Registers handlers for the fixed Runtime pipeline positions. */
	readonly pipeline: PluginRuntimePipelineHost
}

/** Owns all mutable setup registries for one isolated application instance. */
export class PluginSetupRegistries {
	readonly #hooks = new OwnedContributionStore()
	readonly #runtime = new OwnedContributionStore()
	readonly #events = new OwnedContributionStore()
	readonly #pipeline = new OwnedContributionStore()
	readonly #access = new OwnedContributionStore()
	readonly #constraintCompilers = new OwnedContributionStore()
	readonly #contexts = new Map<
		string,
		Map<string | undefined, PluginSetupContext>
	>()
	#setupOpen = true
	#hookTargetsResolved = false
	#accessTargetsResolved = false
	readonly #constraintCompilerReader: DatabaseConstraintCompilerReader

	constructor(
		readonly schemas: SchemaRegistry,
		readonly fieldBuilderMethods: () => readonly OwnedFieldBuilderMethod[] = () =>
			emptyFieldBuilderMethods,
		readonly capabilitiesForPlugin: (
			owner: PluginIdentity,
		) => PluginCapabilityReader = () => emptyCapabilityReader,
		readonly assertPrivilegeForPlugin: (
			owner: PluginIdentity,
			privilege: PluginPrivilege,
		) => void = () => undefined,
		readonly typegenGraph: () => CompiledTypegenGraph = () => emptyTypegenGraph,
	) {
		this.#constraintCompilerReader = createDatabaseConstraintCompilerReader(
			() => this.#constraintCompilers.values(),
		)
	}

	/** Supplies capability factories with live compilers but no registration method. */
	getConstraintCompilerReader(): DatabaseConstraintCompilerReader {
		return this.#constraintCompilerReader
	}

	/** @internal Reads native hook declarations for application compilation. */
	getHookContributions(): readonly OwnedPluginContribution[] {
		return this.#hooks.values()
	}

	/** @internal Reads low-level Runtime and enforcement definitions. */
	getRuntimeContributions(): readonly OwnedPluginContribution[] {
		return this.#runtime.values()
	}

	/** @internal Reads post-commit Runtime and named event definitions. */
	getEventContributions(): readonly OwnedPluginContribution[] {
		return this.#events.values()
	}

	/** @internal Reads fixed-position Runtime pipeline definitions. */
	getPipelineContributions(): readonly OwnedPluginContribution[] {
		return this.#pipeline.values()
	}

	/** @internal Reads native Access declarations for application compilation. */
	getAccessContributions(): readonly OwnedPluginContribution[] {
		return this.#access.values()
	}

	/** @internal Enforces one active privilege for a later Core-owned facade. */
	assertPrivilege(owner: PluginIdentity, privilege: PluginPrivilege): void {
		this.assertPrivilegeForPlugin(owner, privilege)
	}

	/** Closes typed setup-only facades before any infrastructure lifecycle phase. */
	closeSetup(): void {
		if (!this.#setupOpen) {
			return
		}

		this.#setupOpen = false
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

		resolvePluginHookTargets(this.schemas, this.#hooks.values())
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

		resolvePluginAccessTargets(this.schemas, this.#access.values())
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
			typegenGraph: this.typegenGraph(),
			capabilities: this.capabilitiesForPlugin(owner),
			access: createPluginAccessRegistry({
				assertPrivilege: () => {
					this.assertPrivilegeForPlugin(owner, 'runtime:constrain')
				},
				isOpen: (): boolean => this.#setupOpen,
				...(owner.instanceId === undefined
					? {}
					: { ownerInstanceId: owner.instanceId }),
				ownerPlugin: owner.pluginId,
				register: (name: string, value: unknown): void => {
					this.#access.registerLocal(owner, name, value)
				},
			}),
			constraintCompilers: createPluginConstraintCompilerRegistry({
				assertPrivilege: () => {
					this.assertPrivilegeForPlugin(owner, 'adapter:consume')
				},
				isOpen: (): boolean => this.#setupOpen,
				ownerPlugin: owner.pluginId,
				register: (name: string, value: unknown): void => {
					this.#constraintCompilers.registerLocal(owner, name, value)
				},
				values: () => this.#constraintCompilers.values(),
			}),
			hooks: createPluginHookRegistry({
				assertPrivilege: () => {
					this.assertPrivilegeForPlugin(owner, 'runtime:intercept')
				},
				isOpen: (): boolean => this.#setupOpen,
				...(owner.instanceId === undefined
					? {}
					: { ownerInstanceId: owner.instanceId }),
				ownerPlugin: owner.pluginId,
				register: (name: string, value: unknown): void => {
					this.#hooks.registerLocal(owner, name, value)
				},
			}),
			runtime: createPluginRuntimeContributionHost({
				assertPrivilege: (privilege) => {
					this.assertPrivilegeForPlugin(owner, privilege)
				},
				isOpen: (): boolean => this.#setupOpen,
				register: (name, value): void => {
					this.#runtime.registerUnique(owner, name, value)
				},
			}),
			events: createPluginEventContributionHost({
				assertPrivilege: (privilege) => {
					this.assertPrivilegeForPlugin(owner, privilege)
				},
				isOpen: (): boolean => this.#setupOpen,
				register: (name, value): void => {
					this.#events.registerUnique(owner, name, value)
				},
			}),
			pipeline: createPluginRuntimePipelineHost({
				assertPrivilege: (privilege) => {
					this.assertPrivilegeForPlugin(owner, privilege)
				},
				isOpen: (): boolean => this.#setupOpen,
				register: (name, value): void => {
					this.#pipeline.registerUnique(owner, name, value)
				},
			}),
		})

		instances.set(owner.instanceId, context)

		return context
	}
}

const setupRegistriesByApplication = new WeakMap<
	object,
	PluginSetupRegistries
>()

/** @internal Binds private Core readers without exposing setup storage publicly. */
export const bindApplicationSetupRegistries = (
	application: object,
	registries: PluginSetupRegistries,
): void => {
	if (setupRegistriesByApplication.has(application)) {
		throw new TypeError('Application setup registries are already bound')
	}

	setupRegistriesByApplication.set(application, registries)
}

const readApplicationSetupRegistries = (
	application: object,
): PluginSetupRegistries => {
	const registries = setupRegistriesByApplication.get(application)

	if (registries === undefined) {
		throw new TypeError('Application setup registries are unavailable')
	}

	return registries
}

/** @internal Reads only native hook declarations. */
export const readApplicationHookContributions = (
	application: object,
): readonly OwnedPluginContribution[] =>
	readApplicationSetupRegistries(application).getHookContributions()

/** @internal Reads only low-level Runtime and enforcement definitions. */
export const readApplicationRuntimeContributions = (
	application: object,
): readonly OwnedPluginContribution[] =>
	readApplicationSetupRegistries(application).getRuntimeContributions()

/** @internal Reads only post-commit Runtime and named event definitions. */
export const readApplicationEventContributions = (
	application: object,
): readonly OwnedPluginContribution[] =>
	readApplicationSetupRegistries(application).getEventContributions()

/** @internal Reads only fixed-position Runtime pipeline definitions. */
export const readApplicationPipelineContributions = (
	application: object,
): readonly OwnedPluginContribution[] =>
	readApplicationSetupRegistries(application).getPipelineContributions()

/** @internal Reads only native Access declarations. */
export const readApplicationAccessContributions = (
	application: object,
): readonly OwnedPluginContribution[] =>
	readApplicationSetupRegistries(application).getAccessContributions()

/** @internal Enforces one exact plugin-instance privilege during Runtime work. */
export const assertApplicationPluginPrivilege = (
	application: object,
	owner: PluginIdentity,
	privilege: PluginPrivilege,
): void => {
	readApplicationSetupRegistries(application).assertPrivilege(owner, privilege)
}
