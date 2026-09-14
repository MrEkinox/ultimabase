import { definePlugin } from '@ultimabase/core'

export const deliveryPlugin = definePlugin({
	core: '^0.0.0',
	environment: ['environment:network'],
	pluginId: 'community.delivery',
	privileges: [
		{
			name: 'event:publish',
			reason: 'Publishes committed delivery events.',
		},
	],
	setup: () => ({ provider: 'example' as const }),
	version: '1.0.0',
})
