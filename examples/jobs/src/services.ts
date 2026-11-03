// Stands for the services the jobs call: a video call service, which takes
// an idempotency key, and an email service.

/** The rooms the video call service closed, in order. */
export const closedRooms: string[] = []
const keys = new Set<string>()

/** Closes a room, once per key: a second call with the same key does nothing. */
export function closeVideoRoom(
	room: string,
	options: { readonly key: string },
) {
	if (keys.has(options.key)) return
	keys.add(options.key)
	closedRooms.push(room)
}

/** The emails sent, in order. */
export const outbox: string[] = []
