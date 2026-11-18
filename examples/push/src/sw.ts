// The service worker, which the front end builds and serves at /sw.js: it
// shows each push, and opens its page on a click.
import { z } from 'zod'

declare const self: ServiceWorkerGlobalScope

//#region worker
// What push.send gives each device.
const Message = z.object({
	title: z.string(),
	body: z.string(),
	url: z.string().optional(),
	tag: z.string().optional(),
})

self.addEventListener('push', (event) => {
	const { title, body, url, tag } = Message.parse(event.data?.json())
	const shown = self.registration.showNotification(title, {
		body,
		// An empty tag, the default, replaces nothing.
		tag: tag ?? '',
		data: url ?? '/',
	})
	event.waitUntil(shown)
})

self.addEventListener('notificationclick', (event) => {
	event.notification.close()
	const url = z.string().parse(event.notification.data)
	event.waitUntil(self.clients.openWindow(url))
})
//#endregion
