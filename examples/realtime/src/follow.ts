// A client of a live list over graphql-ws: it keeps the list up to date and
// shows it at each message.
//#region follow
import type { LiveMessage } from '@ultimabase/live'
import { applyLive } from '@ultimabase/live'
import type { Client } from 'graphql-ws'

export type Tasks = {
	readonly tasks: {
		readonly edges: readonly {
			readonly node: { readonly id: string; readonly title: string }
		}[]
	}
}

export async function follow(
	client: Client,
	query: string,
	show: (tasks: Tasks['tasks']) => void,
) {
	let tasks: Tasks['tasks'] | undefined
	const results = client.iterate<Tasks, { live: LiveMessage }>({ query })
	for await (const { data, extensions } of results) {
		if (data) tasks = data.tasks
		else if (tasks && extensions) tasks = applyLive(tasks, extensions.live)
		if (tasks) show(tasks)
	}
}
//#endregion
