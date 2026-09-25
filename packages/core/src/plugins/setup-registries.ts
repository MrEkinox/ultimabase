import type {
	CompiledSchemaRegistry,
	OwnedFieldBuilderMethod,
	OwnedPluginFieldType,
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
	formatPluginIdentity,
	type PluginIdentity,
	type PluginPrivilege,
} from './manifest.js'
import type { CompiledTypegenGraph } from './typegen-declarations.js'
import {
	createAdapterAccess,
	type AdapterAccess,
} from '../runtime/adapters/raw-access.js'

const emptyFieldBuilderMethods: readonly OwnedFieldBuilderMethod[] =
	immutableArray([])
const emptyPluginFieldTypes: readonly OwnedPluginFieldType[] = immutableArray(
	[],
)
const emptyCapabilityReader: PluginCapabilityReader = immutableRecord({
	contributions: () => {
		throw new TypeError('No capability graph is configured')
	},
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
	/** Exposes generated plugin value contracts independently from builder methods. */
	readonly pluginFieldTypes: readonly OwnedPluginFieldType[]
	/** Exposes the callback-free final application graph to declaration tooling. */
	readonly typegenGraph: CompiledTypegenGraph
	/** Reads only exact capability requirements declared by this plugin. */
	readonly capabilities: PluginCapabilityReader
	/** Opens adapter-owned raw facades only for the lifetime of one setup callback. */
	readonly adapters: AdapterAccess
	/** Registers adapter constraint compilers with owner-derived provenance. */
	readonly constraintCompilers: PluginConstraintCompilerRegistry
}

/** Owns all mutable setup registries for one isolated application instance. */
export class PluginSetupRegistries {
	readonly #constraintCompilers = new OwnedContributionStore()
	readonly #contexts = new Map<
		string,
		Map<string | undefined, PluginSetupContext>
	>()
	#setupOpen = true
	readonly #constraintCompilerReader: DatabaseConstraintCompilerReader

	constructor(
		readonly schemas: SchemaRegistry,
		readonly fieldBuilderMethods: () => readonly OwnedFieldBuilderMethod[] = () =>
			emptyFieldBuilderMethods,
		readonly pluginFieldTypes: () => readonly OwnedPluginFieldType[] = () =>
			emptyPluginFieldTypes,
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

		const capabilities = this.capabilitiesForPlugin(owner)
		const context = immutableRecord({
			schemas: this.schemas,
			fieldBuilderMethods: this.fieldBuilderMethods(),
			pluginFieldTypes: this.pluginFieldTypes(),
			typegenGraph: this.typegenGraph(),
			capabilities,
			adapters: createAdapterAccess({
				assertPrivilege: (privilege) => {
					this.assertPrivilegeForPlugin(owner, privilege)
				},
				capabilities,
				isOpen: (): boolean => this.#setupOpen,
				scope: () => immutableRecord({ kind: 'setup' as const }),
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
		})

		instances.set(owner.instanceId, context)

		return context
	}
}
