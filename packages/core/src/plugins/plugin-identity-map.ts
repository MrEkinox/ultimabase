import type { PluginIdentity } from './manifest.js'

/** Stores application-local values by structured plugin and instance identity. */
export class PluginIdentityMap<TValue> {
	readonly #plugins = new Map<string, Map<string | undefined, TValue>>()

	get(owner: PluginIdentity): TValue | undefined {
		return this.#plugins.get(owner.pluginId)?.get(owner.instanceId)
	}

	set(owner: PluginIdentity, value: TValue): void {
		let instances = this.#plugins.get(owner.pluginId)
		if (instances === undefined) {
			instances = new Map()
			this.#plugins.set(owner.pluginId, instances)
		}
		instances.set(owner.instanceId, value)
	}

	getOrCreate(owner: PluginIdentity, create: () => TValue): TValue {
		const existing = this.get(owner)
		if (existing !== undefined) return existing
		const value = create()
		this.set(owner, value)
		return value
	}
}
