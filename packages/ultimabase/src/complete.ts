// A user caller completed with its plugins' keys (D-121): once per object
// until a model of a plugin with `caller` changes (D-332), each plugin's
// `caller` in the order of `plugins`, a key given by one only, a symbol key
// as a string one (D-126).
import type { Changed, Feed } from './adapter-feed.ts'
import type { PluginCode } from './definition.ts'
import { isObject } from './query-where.ts'
import type { Caller, Identity } from './rules.ts'
import type { Resolved } from './schema.ts'

/** A plugin's `caller`, bound to its context. */
export type PluginCaller = {
	readonly plugin: string
	readonly caller: (identity: Identity) => Promise<unknown>
}

export type Complete = (identity: Identity) => Promise<Caller>

// The keys every caller holds, which no plugin gives.
const own = new Set<PropertyKey>(['kind', 'user'])

async function completed(
	identity: Identity,
	plugins: readonly PluginCaller[],
): Promise<Caller> {
	const keys: { [key: PropertyKey]: unknown } = {}
	const givers = new Map<PropertyKey, string>()
	for (const { plugin, caller } of plugins) {
		const given = await caller(identity)
		if (!isObject(given)) {
			throw new TypeError(`${plugin}.caller returns an object of keys.`)
		}
		for (const key of Reflect.ownKeys(given)) {
			if (!Object.prototype.propertyIsEnumerable.call(given, key)) continue
			const other = own.has(key) ? 'the kernel' : givers.get(key)
			if (other !== undefined) {
				throw new Error(
					`${plugin}.caller gives the caller ${String(key)}, which ${other} gives; a key has one plugin.`,
				)
			}
			givers.set(key, plugin)
			const value: unknown = Reflect.get(given, key)
			keys[key] = value
		}
	}
	// Unnecessary only while no plugin declares a key: once one does, the
	// kernel's types cannot see it given (D-121). caller-keys-typing proves it.
	// oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- see above.
	return Object.freeze({ ...identity, ...keys }) as Caller
}

/** Whether a change concerns a plugin's `caller`. */
export type Concerns = (change: Changed) => boolean

/**
 * Whether a change touches a model that a plugin with `caller` owns or is
 * used by, a link to one included; `undefined` when there is none.
 */
export function concerning(
	resolved: Resolved,
	codes: readonly PluginCode[],
): Concerns | undefined {
	const givers = new Set(
		codes.filter(({ caller }) => caller !== undefined).map(({ name }) => name),
	)
	const names = new Set(
		[...resolved.models.values()]
			.filter(
				({ owner, plugins }) =>
					(owner !== undefined && givers.has(owner)) ||
					plugins.some(({ code }) => givers.has(code.name)),
			)
			.map(({ name }) => name),
	)
	if (names.size === 0) return undefined
	return (change) => {
		if (names.has(change.model)) return true
		if (change.kind !== 'link' && change.kind !== 'unlink') return false
		const field = resolved.models.get(change.model)?.fields.get(change.field)
		return field?.kind === 'many' && names.has(field.target)
	}
}

export type Completer = {
	readonly complete: Complete
	/** What forgets the completed callers, when a change concerns them. */
	readonly feed: Feed | undefined
}

/**
 * Completes a user caller the first time the kernel receives it, until a
 * change `concerns` forgets every completed one; from `lost` to `missed`, it
 * keeps none (D-332). `plugins` is read on each call, filled once their
 * contexts exist.
 */
export function completer(
	plugins: readonly PluginCaller[],
	concerns?: Concerns,
): Completer {
	let pending = new WeakMap<object, Promise<Caller>>()
	let done = new WeakSet<object>()
	let generation = 0
	let blind = false
	const forget = (): void => {
		pending = new WeakMap()
		done = new WeakSet()
		generation += 1
	}
	// A completed caller, or a user one when no plugin gives a key.
	const kept = (identity: Identity): identity is Caller & Identity =>
		plugins.length === 0 || done.has(identity)
	const complete: Complete = async (identity) => {
		if (identity.kind !== 'user' || kept(identity)) return identity
		const known = pending.get(identity)
		if (known !== undefined) return known
		const at = generation
		const caller = completed(identity, plugins).then((result) => {
			// Read before a change that forgot the others: it may be stale.
			if (generation === at && !blind) done.add(result)
			return result
		})
		const waiting = pending
		if (!blind) waiting.set(identity, caller)
		// A failure is not kept: the next request tries again.
		caller.catch(() => waiting.delete(identity))
		return caller
	}
	const feed: Feed | undefined =
		concerns === undefined
			? undefined
			: {
					changed: (changes) => {
						if (changes.some(concerns)) forget()
					},
					lost: () => {
						blind = true
						forget()
					},
					missed: () => {
						blind = false
						forget()
					},
				}
	return { complete, feed }
}
