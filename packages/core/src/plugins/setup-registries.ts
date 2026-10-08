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

import type { PluginCapabilityReader } from './capabilities.js'
import {
	createDatabaseConstraintCompilerReader,
	createPluginConstraintCompilerRegistry,
	type DatabaseConstraintCompilerReader,
	type PluginConstraintCompilerRegistry,
} from './constraint-compilers.js'
import {
	snapshotPluginIdentity,
	type PluginIdentity,
	type PluginPrivilege,
} from './manifest.js'
import { PluginIdentityMap } from './plugin-identity-map.js'
import type { CompiledTypegenGraph } from './typegen-declarations.js'

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
	const identity = typeof owner === 'string' ? { pluginId: owner } : owner
	assertNonEmptyString(identity.pluginId, 'pluginId')
	if (identity.instanceId !== undefined) {
		assertNonEmptyString(identity.instanceId, 'instanceId')
	}
	return typeof owner === 'string' ? snapshotPluginIdentity(identity) : owner
}

/** @internal Records immutable setup metadata with its structured owner. */
export interface OwnedPluginContribution {
	readonly name: string
	readonly ownerPlugin: string
	readonly ownerInstanceId?: string
	readonly value: unknown
}

/** Attributes one registered value to the plugin identity that contributed it. */
export const ownPluginContribution = (
	name: string,
	owner: PluginIdentity,
	value: unknown,
): OwnedPluginContribution =>
	immutableRecord({
		name,
		ownerPlugin: owner.pluginId,
		...(owner.instanceId === undefined
			? {}
			: { ownerInstanceId: owner.instanceId }),
		value,
	})

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
	/** Registers adapter constraint compilers with owner-derived provenance. */
	readonly constraintCompilers: PluginConstraintCompilerRegistry
}

/** Owns all mutable setup registries for one isolated application instance. */
export class PluginSetupRegistries {
	readonly #constraintCompilers: OwnedPluginContribution[] = []
	readonly #contexts = new PluginIdentityMap<PluginSetupContext>()
	#setupOpen = true
	readonly #constraintCompilerReader: DatabaseConstraintCompilerReader =
		createDatabaseConstraintCompilerReader(() =>
			immutableArray(this.#constraintCompilers),
		)

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
	) {}

	/** Supplies capability factories with live compilers but no registration method. */
	getConstraintCompilerReader(): DatabaseConstraintCompilerReader {
		return this.#constraintCompilerReader
	}

	/**
	 * Closes typed setup-only facades before any infrastructure lifecycle phase,
	 * or after a plugin failure without masking the original error.
	 */
	closeSetup(): void {
		this.#setupOpen = false
	}

	/** Returns one stable owner-bound setup context for a structured plugin identity. */
	forPlugin(ownerInput: PluginIdentity | string): PluginSetupContext {
		const owner = toPluginIdentity(ownerInput)
		return this.#contexts.getOrCreate(owner, () => {
			const capabilities = this.capabilitiesForPlugin(owner)
			const isOpen = (): boolean => this.#setupOpen
			return immutableRecord({
				schemas: this.schemas,
				fieldBuilderMethods: this.fieldBuilderMethods(),
				pluginFieldTypes: this.pluginFieldTypes(),
				typegenGraph: this.typegenGraph(),
				capabilities,
				constraintCompilers: createPluginConstraintCompilerRegistry({
					assertPrivilege: () => {
						this.assertPrivilegeForPlugin(owner, 'adapter:consume')
					},
					isOpen,
					ownerPlugin: owner.pluginId,
					// Compiler identities are unique application-wide, so ownership is the only key.
					register: (name: string, value: unknown): void => {
						this.#constraintCompilers.push(
							ownPluginContribution(name, owner, value),
						)
					},
					values: () => this.#constraintCompilers,
				}),
			})
		})
	}
}
