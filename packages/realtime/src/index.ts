// `realtimePlugin()` and `realtime()` (D-154): live lists and live rows of
// the models that use it, which follow each commit's changes and send only
// what changed, under the caller's read rules.
import type { PluginOf, PluginTypes, UseOf } from 'ultimabase'
import { definePlugin } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import { Engine } from './engine.ts'
import type { Viewer } from './viewer.ts'

export type { LiveMessage, Removal, Upsert } from './messages.ts'
export type { LiveHandle, Viewer } from './viewer.ts'

export type RealtimeOptions = {
	/** The most rows a live list follows, nested rows included; 1000. */
	readonly maxLive?: number
	/** How often, in milliseconds, each caller is built again; 5 minutes. */
	readonly refresh?: number
}

/** What the realtime plugin offers transports. */
export interface RealtimeApi {
	/** Follows `request`'s caller; its live reads close with it. */
	connect(this: void, request: Request): Promise<Viewer>
}

/** The realtime plugin's types (D-57). */
export interface Realtime extends PluginTypes {
	readonly name: 'realtime'
	readonly appOptions: RealtimeOptions
	readonly with: { readonly maxLive?: number }
	readonly api: RealtimeApi
}

// Each running application's engine, by the context its plugin received.
const engines = new WeakMap<object, Engine>()

const positive = (name: string, value: number | undefined): void => {
	if (value === undefined || (Number.isInteger(value) && value > 0)) return
	throw new Error(`realtime's ${name} must be a positive integer.`)
}

const realtimeDefinition = definePlugin<Realtime>({
	name: 'realtime',
	manifest,
	api: (context) => {
		const { options, identify, logger, models } = context
		positive('maxLive', options.maxLive)
		positive('refresh', options.refresh)
		for (const model of models) positive('maxLive', model.with?.maxLive)
		const engine = new Engine(
			{ models, identify, logger, maxLive: options.maxLive ?? 1000 },
			options.refresh ?? 300_000,
		)
		engines.set(context, engine)
		return { connect: async (request) => engine.connect(request) }
	},
	changed: (changes, context) => engines.get(context)?.changed(changes),
	missed: (context) => engines.get(context)?.missed(),
	stop: async (context) => engines.get(context)?.stop(),
})

export const realtime: UseOf<Realtime> = realtimeDefinition.use
export const realtimePlugin: PluginOf<Realtime> = realtimeDefinition.plugin
