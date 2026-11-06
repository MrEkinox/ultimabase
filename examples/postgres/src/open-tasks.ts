// A plugin that keeps the number of open tasks, counted again when it may be
// wrong.
//#region plugin
import type { PluginTypes } from 'ultimabase'
import { definePlugin, master } from 'ultimabase'
import { Task } from './models.ts'

interface OpenTasks extends PluginTypes {
	readonly name: 'openTasks'
}

/** What the plugin counted last. */
export const counted: { open?: number } = {}

const count = async () => {
	counted.open = await Task.count({ where: { done: false } }, { as: master })
}

export const openTasks = definePlugin<OpenTasks>({
	name: 'openTasks',
	start: count,
	changed: (changes) => {
		if (changes.some((change) => change.model === 'Task')) void count()
	},
	missed: () => void count(),
})
//#endregion
