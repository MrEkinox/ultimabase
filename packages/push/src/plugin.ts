// `pushPlugin()` (D-408): the devices users signed in on, and the keys
// that sign each push. It shows nothing to any transport.
import type { Auth } from '@ultimabase/auth'
import { authPlugin } from '@ultimabase/auth'
import type { PluginOf, PluginTypes } from 'ultimabase'
import { definePlugin } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import { PushDevice } from './device.ts'
import type { PushOptions } from './options.ts'
import { vapidOf } from './options.ts'
import { useRunning } from './running.ts'

/** push's types (D-57). */
export interface Push extends PluginTypes {
	readonly name: 'push'
	readonly requires: Auth
	readonly appOptions: PushOptions
}

const definition = definePlugin<Push>({
	name: 'push',
	manifest,
	requires: { auth: authPlugin },
	models: [PushDevice],
	start: ({ options, plugins, logger }) => {
		const vapid = vapidOf(options)
		if (vapid === undefined) {
			logger.warn(
				'pushPlugin() has no web keys: web devices are not registered and nothing is sent. Run npx @ultimabase/push keys.',
			)
		}
		useRunning({ vapid, auth: plugins.auth, logger })
	},
	stop: () => {
		useRunning(undefined)
	},
})

/** Push notifications to the devices of signed-in sessions (D-408). */
export const pushPlugin: PluginOf<Push> = definition.plugin
