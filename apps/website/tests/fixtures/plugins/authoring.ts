import { definePluginModule } from '@ultimabase/plugin-kit'

const workflow = definePluginModule({
	core: '^0.0.0',
	pluginId: 'community.workflow',
	version: '1.0.0',
})

export const workflowPlugin = (instanceId?: string) =>
	workflow.plugin({
		...(instanceId === undefined ? {} : { instanceId }),
		setup: () => ({ ready: true as const }),
	})
