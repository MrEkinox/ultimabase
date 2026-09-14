import { definePlugin } from '@ultimabase/core'

export const storagePlugin = definePlugin({
	core: '^0.0.0',
	pluginId: 'community.storage',
	setup: () => ({ connected: false }),
	version: '1.0.0',
})

export const searchPlugin = definePlugin({
	core: '^0.0.0',
	dependencies: [{ pluginId: 'community.storage', version: '^1.0.0' }],
	hooks: {
		connect: ({ pluginExports }) => {
			void pluginExports.ready
		},
		dispose: ({ pluginExports }) => {
			void pluginExports.ready
		},
	},
	pluginId: 'community.search',
	setup: () => ({ ready: true as const }),
	version: '1.0.0',
})
