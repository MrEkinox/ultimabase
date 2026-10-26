// A user caller completed with its plugins' keys (D-121): once per object,
// each plugin's `caller` in the order of `plugins`, a key given by one only.
import { isObject } from './query-where.ts'
import type { Caller, Identity } from './rules.ts'

/** A plugin's `caller`, bound to its context. */
export type PluginCaller = {
	readonly plugin: string
	readonly caller: (identity: Identity) => Promise<unknown>
}

export type Complete = (identity: Identity) => Promise<Caller>

// The keys every caller holds, which no plugin gives.
const own = new Set(['kind', 'user'])

async function completed(
	identity: Identity,
	plugins: readonly PluginCaller[],
): Promise<Caller> {
	const keys: { [key: string]: unknown } = {}
	const givers = new Map<string, string>()
	for (const { plugin, caller } of plugins) {
		const given = await caller(identity)
		if (!isObject(given)) {
			throw new TypeError(`${plugin}.caller returns an object of keys.`)
		}
		for (const [key, value] of Object.entries(given)) {
			const other = own.has(key) ? 'the kernel' : givers.get(key)
			if (other !== undefined) {
				throw new Error(
					`${plugin}.caller gives the caller ${key}, which ${other} gives; a key has one plugin.`,
				)
			}
			givers.set(key, plugin)
			keys[key] = value
		}
	}
	// Each plugin types its keys (D-121); the kernel checks none is given twice.
	return Object.freeze({ ...identity, ...keys })
}

/**
 * Completes a user caller the first time the kernel receives it; `plugins`
 * is read on each call, filled once their contexts exist.
 */
export function completer(plugins: readonly PluginCaller[]): Complete {
	const pending = new WeakMap<object, Promise<Caller>>()
	const done = new WeakSet<object>()
	// A completed caller, or a user one when no plugin gives a key.
	const kept = (identity: Identity): identity is Caller & Identity =>
		done.has(identity)
	return async (identity) => {
		if (identity.kind !== 'user') return identity
		if (plugins.length === 0) done.add(identity)
		if (kept(identity)) return identity
		const known = pending.get(identity)
		if (known !== undefined) return known
		const caller = completed(identity, plugins).then((result) => {
			done.add(result)
			return result
		})
		pending.set(identity, caller)
		// A failure is not kept: the next request tries again.
		caller.catch(() => pending.delete(identity))
		return caller
	}
}
