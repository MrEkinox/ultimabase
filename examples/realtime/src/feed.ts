// A plugin's own WebSocket: ws://…/tasks sends the task list live to its
// caller, and closes once the caller's viewer does.
import type { Http } from '@ultimabase/http'
import { httpPlugin } from '@ultimabase/http'
import type { Realtime, RealtimeApi } from '@ultimabase/realtime'
import { realtimePlugin } from '@ultimabase/realtime'
import type { PluginOf, PluginTypes } from 'ultimabase'
import { definePlugin } from 'ultimabase'
import { WebSocket, WebSocketServer } from 'ws'

interface TaskFeed extends PluginTypes {
	readonly name: 'taskFeed'
	readonly requires: Http | Realtime
}

//#region follow
/** Sends the first ten tasks, then what changed, as long as both stay. */
async function follow(
	realtime: RealtimeApi,
	request: Request,
	client: WebSocket,
): Promise<void> {
	const viewer = await realtime.connect(request)
	// The caller signed out, or the application stops: the socket closes.
	viewer.onClose(() => client.close())
	// The client left, even while it connected: the viewer closes.
	client.on('close', () => viewer.close())
	if (client.readyState !== WebSocket.OPEN) viewer.close()
	await viewer.list(
		'Task',
		{ first: 10, orderBy: { rank: 'asc' }, select: { title: true } },
		(message) => client.send(JSON.stringify(message)),
	)
}
//#endregion

const sockets = new WebSocketServer({ noServer: true })

//#region plugin
export const taskFeedPlugin: PluginOf<TaskFeed> = definePlugin<TaskFeed>({
	name: 'taskFeed',
	requires: { http: httpPlugin, realtime: realtimePlugin },
	api: ({ plugins }) => {
		plugins.http.upgrade(
			'/tasks',
			({ request, incoming, socket, head }) => {
				sockets.handleUpgrade(incoming, socket, head, (client) => {
					// A caller identify refuses gets a closed socket.
					follow(plugins.realtime, request, client).catch(() => client.close())
				})
			},
			{
				// What closeUpgrades asks, as maintenance begins.
				close: (code, reason) => {
					for (const client of sockets.clients) client.close(code, reason)
				},
			},
		)
	},
}).plugin
//#endregion
