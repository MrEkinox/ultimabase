import type { Logger } from '../application/application-log.js'
import type { CompiledSchemaRegistry, SchemaRegistry } from '../schema/index.js'
import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import type { PluginCapabilityReader } from './capabilities.js'
import { snapshotPluginIdentity, type PluginIdentity } from './manifest.js'
import { PluginIdentityMap } from './plugin-identity-map.js'

const emptyCapabilityReader: PluginCapabilityReader = immutableRecord({
	contributions: () => {
		throw new TypeError('No capability graph is configured')
	},
	get: () => {
		throw new TypeError('No capability graph is configured')
	},
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
	/** Reads only exact capability requirements declared by this plugin. */
	readonly capabilities: PluginCapabilityReader
	/**
	 * Writes through the application logger; every line starts with this
	 * plugin's package name (ADR-0313). Never log option values or secrets.
	 *
	 * @example `logger.debug('introspection enabled (NODE_ENV: development)')`
	 */
	readonly logger: Logger
	/**
	 * Stops the application as `ultimabase.stop()` does, for a plugin that
	 * owns a process-level stop request such as a signal (ADR-0340). Call it
	 * from such an event, never from a request or an operation: stopping
	 * waits for them.
	 *
	 * @example `process.once('SIGTERM', () => void stopApplication())`
	 */
	readonly stopApplication: () => Promise<void>
}

const silentLogger: Logger = Object.freeze({
	debug: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
})

/** Owns all mutable setup registries for one isolated application instance. */
export class PluginSetupRegistries {
	readonly #contexts = new PluginIdentityMap<PluginSetupContext>()

	constructor(
		readonly schemas: SchemaRegistry,
		readonly capabilitiesForPlugin: (
			owner: PluginIdentity,
		) => PluginCapabilityReader = () => emptyCapabilityReader,
		readonly loggerForPlugin: (owner: PluginIdentity) => Logger = () =>
			silentLogger,
		readonly stopApplication: () => Promise<void> = () => Promise.resolve(),
	) {}

	/** Returns one stable owner-bound setup context for a structured plugin identity. */
	forPlugin(ownerInput: PluginIdentity | string): PluginSetupContext {
		const owner = toPluginIdentity(ownerInput)
		return this.#contexts.getOrCreate(owner, () => {
			const capabilities = this.capabilitiesForPlugin(owner)
			return immutableRecord({
				schemas: this.schemas,
				capabilities,
				logger: this.loggerForPlugin(owner),
				stopApplication: this.stopApplication,
			})
		})
	}
}
