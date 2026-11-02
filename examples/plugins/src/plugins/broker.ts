// A plugin that reads a message broker: the instance is ready while the
// broker is connected, takes messages once every plugin started, and takes
// no more once the stop begins, while the HTTP server still serves.
import type { Http } from '@ultimabase/http'
import { httpPlugin } from '@ultimabase/http'
import type { PluginOf, PluginTypes } from 'ultimabase'
import { definePlugin } from 'ultimabase'

/** A broker's client, as its package would give it. */
export const broker = {
	connected: true,
	subscribed: false,
	subscribe() {
		this.subscribed = true
	},
	async unsubscribe() {
		this.subscribed = false
	},
}

export interface Broker extends PluginTypes {
	readonly name: 'broker'
	readonly requires: Http
}

//#region definition
const definition = definePlugin<Broker>({
	name: 'broker',
	requires: { http: httpPlugin },
	// `GET /ready` answers 503 while the broker is not connected.
	api: ({ plugins }) => {
		plugins.http.ready(() => broker.connected)
	},
	// Once every plugin started: the messages find the plugins ready.
	started: () => {
		broker.subscribe()
	},
	// When the stop begins, before any plugin stops.
	stopping: async () => {
		await broker.unsubscribe()
	},
})
//#endregion

export const brokerPlugin: PluginOf<Broker> = definition.plugin
