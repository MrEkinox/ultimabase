import { contributeApplication, plugin } from '@ultimabase/core/plugin'

/** Stands in for a network client the plugin owns; the tests read it. */
export const client = {
	connected: false,
	connect: () => {
		client.connected = true
	},
	disconnect: () => {
		client.connected = false
	},
}

export const clientPlugin = plugin({
	contributions: [
		//#region lifecycle
		// A lifecycle-only resource: no exports; Core calls each phase in order.
		contributeApplication(() => ({
			connect: () => {
				client.connect()
			},
			dispose: () => {
				client.disconnect()
			},
		})),
		//#endregion lifecycle
	],
	core: '^0.0.0',
	id: 'community.client',
	version: '1.0.0',
})
