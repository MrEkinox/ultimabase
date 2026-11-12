// Stands for the services the jobs call: a video call service, which takes
// an idempotency key and tells who is in a room, and an email service.

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

/** The people in each room, as the video call service counts them. */
export const roomSizes = new Map<string, number>()
/** The rooms fetched, in order. */
export const fetchedRooms: string[] = []

/** The video call service's state of a room, as it is now. */
export function fetchRoom(room: string) {
	fetchedRooms.push(room)
	return { participants: roomSizes.get(room) ?? 0 }
}

/** The emails sent, in order. */
export const outbox: string[] = []
