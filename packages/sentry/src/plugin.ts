// `sentryPlugin()` (D-361): the kernel's operations, hooks, virtuals and
// functions spans of the request's trace, and the errors the server masks
// issues, in the client the application's `Sentry.init` made.
import { isInitialized } from '@sentry/node'
import type { PluginOf, PluginTypes } from 'ultimabase'
import { definePlugin } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import { followAll, sentryStore } from './spans.ts'

/** The Sentry plugin's types (D-57). */
export interface Sentry extends PluginTypes {
	readonly name: 'sentry'
}

// The channels followed, while the application runs.
let following: readonly (() => void)[] = []

const definition = definePlugin<Sentry>({
	name: 'sentry',
	manifest,
	start: ({ logger }) => {
		if (!isInitialized()) {
			if (process.env['NODE_ENV'] !== 'test') {
				logger.warn(
					'Sentry is not initialized: call Sentry.init before the app starts.',
				)
			}
			return
		}
		const store = sentryStore()
		if (store === undefined) {
			logger.warn(
				'Sentry’s spans of UltimaBase are flat: the application has two versions of @sentry/core; deduplicate them.',
			)
		}
		following = followAll(store)
	},
	stop: () => {
		for (const stop of following) stop()
		following = []
	},
})

/** Sentry: spans of each operation, hook, virtual and function, and issues of the errors the server masks (D-361). */
export const sentryPlugin: PluginOf<Sentry> = definition.plugin
