// The front end's side: subscribes this browser for the signed-in user, or
// turns its notifications off. `token` is the session's, from signIn.
import { z } from 'zod'

/** A function's answer from the application's REST API. */
async function call(name: string, token: string, body?: object) {
	const response = await fetch(`/api/functions/${name}`, {
		method: body === undefined ? 'GET' : 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${token}`,
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	})
	const answer: unknown = await response.json()
	return answer
}

//#region subscribe
// On a click: the browser asks the user first.
export async function enableNotifications(token: string) {
	const answer = await call('pushKey', token)
	const key = z.string().nullable().parse(answer)
	if (key === null || (await Notification.requestPermission()) !== 'granted')
		return false
	const worker = await navigator.serviceWorker.register('/sw.js')
	const subscription = await worker.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: key,
	})
	const { endpoint, keys } = subscription.toJSON()
	const saved = await call('subscribePush', token, { endpoint, ...keys })
	return z.boolean().parse(saved)
}

export async function disableNotifications(token: string) {
	const worker = await navigator.serviceWorker.getRegistration('/sw.js')
	const subscription = await worker?.pushManager.getSubscription()
	await subscription?.unsubscribe()
	await call('unsubscribePush', token, {})
}
//#endregion
