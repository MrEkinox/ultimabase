// `realtimePlugin()` and `realtime()` (D-154): live lists and live rows of
// the models that use it, which follow each commit's changes and send only
// what changed, under the caller's read rules; and the live functions, the
// queries whose `use` lists it, run again when what they read changes.
import type {
	ExposedFunction,
	ExposedOutput,
	PluginOf,
	PluginTypes,
	UseOf,
} from 'ultimabase'
import { definePlugin } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import { ownerOf } from './computed.ts'
import { Engine } from './engine.ts'
import { Gate, opening } from './gate.ts'
import type { Viewer } from './viewer.ts'

export type { LiveHandle, LiveMessage, Removal, Upsert } from './messages.ts'
export type { Viewer } from './viewer.ts'

export type RealtimeOptions = {
	/** The most rows a live list follows, nested rows apart; 50 000. */
	readonly maxLive?: number
	/** The most live reads one connection holds; 100. */
	readonly maxSubscriptions?: number
	/** The most list rows one connection follows in all; 100 000. */
	readonly maxConnectionRows?: number
	/** How often, in milliseconds, each caller is built again; 5 minutes. */
	readonly refresh?: number
	/**
	 * Plugin functions live as if their `use` listed `realtime()`, by owner
	 * name, as `auth.viewer` (D-362).
	 */
	readonly liveFunctions?: readonly string[]
}

/** What the realtime plugin offers transports. */
export interface RealtimeApi {
	/** Follows `request`'s caller; its live reads close with it. */
	connect(this: void, request: Request): Promise<Viewer>
	/** Whether `request` is `viewer`'s user, read without following it. */
	sameUser(this: void, viewer: Viewer, request: Request): Promise<boolean>
	/** Whether `model`'s `use` lists `realtime()`. */
	live(this: void, model: string): boolean
	/** Whether function `name`'s `use` lists `realtime()`, `plugin.name` for a plugin's. */
	liveFunction(this: void, name: string): boolean
}

/** The realtime plugin's types (D-57). */
export interface Realtime extends PluginTypes {
	readonly name: 'realtime'
	readonly appOptions: RealtimeOptions
	readonly with: { readonly maxLive?: number }
	/** A live function's wait for quiet after a write, in milliseconds; 50. */
	readonly functionWith: { readonly debounce?: number }
	readonly queryOnly: true
	readonly api: RealtimeApi
}

// Each running application's engine, by the context its plugin received.
const engines = new WeakMap<object, Engine>()

const positive = (name: string, value: number | undefined): void => {
	if (value === undefined || (Number.isInteger(value) && value > 0)) return
	throw new Error(`realtime's ${name} must be a positive integer.`)
}

// A page is read once, by the transport's page arguments (D-182).
const holdsPage = (output: ExposedOutput | undefined): boolean =>
	output?.kind === 'page' ||
	(output?.kind === 'type' && [...output.type.fields.values()].some(holdsPage))

type Fn = ExposedFunction<{ readonly debounce?: number }>

/** `functions`, the plugin functions `names` names live (D-362). */
function marked(functions: readonly Fn[], names: readonly string[]): Fn[] {
	const live = new Set(names)
	for (const name of live) {
		const fn = functions.find((one) => ownerOf(one) === name)
		if (fn?.plugin !== undefined) continue
		const why =
			fn === undefined
				? "which is not a plugin's function"
				: "the application's own: list realtime() in its use"
		throw new Error(`realtime's liveFunctions names ${name}, ${why}.`)
	}
	return functions.map((fn) =>
		live.has(ownerOf(fn)) ? { ...fn, used: true } : fn,
	)
}

const realtimeDefinition = definePlugin<Realtime>({
	name: 'realtime',
	manifest,
	api: (context) => {
		const { options, identify, logger, models } = context
		const functions = marked(context.functions, options.liveFunctions ?? [])
		positive('maxLive', options.maxLive)
		positive('maxSubscriptions', options.maxSubscriptions)
		positive('maxConnectionRows', options.maxConnectionRows)
		positive('refresh', options.refresh)
		for (const model of models) positive('maxLive', model.with?.maxLive)
		for (const fn of functions) {
			positive('debounce', fn.with?.debounce)
			if (fn.used && !fn.query) {
				throw new Error(`${ownerOf(fn)} is a mutation: it cannot be live.`)
			}
			if (fn.used && holdsPage(fn.output)) {
				throw new Error(`${ownerOf(fn)} returns a page: it cannot be live.`)
			}
		}
		const engine = new Engine(
			{
				models,
				functions,
				identify,
				logger,
				maxLive: options.maxLive ?? 50_000,
				maxSubscriptions: options.maxSubscriptions ?? 100,
				maxConnectionRows: options.maxConnectionRows ?? 100_000,
				opens: new Gate(opening),
			},
			options.refresh ?? 300_000,
		)
		engines.set(context, engine)
		const live = new Set(
			models.filter(({ used }) => used).map(({ schema }) => schema.name),
		)
		const followed = new Set(functions.filter(({ used }) => used).map(ownerOf))
		return {
			connect: async (request) => engine.connect(request),
			sameUser: async (viewer, request) => engine.sameUser(viewer, request),
			live: (model) => live.has(model),
			liveFunction: (name) => followed.has(name),
		}
	},
	changed: (changes, context) => engines.get(context)?.changed(changes),
	missed: (context) => engines.get(context)?.missed(),
	stop: async (context) => engines.get(context)?.stop(),
})

export const realtime: UseOf<Realtime> = realtimeDefinition.use
export const realtimePlugin: PluginOf<Realtime> = realtimeDefinition.plugin
