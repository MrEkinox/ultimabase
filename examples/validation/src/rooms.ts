// A stand-in for the venue's booking service, which an async validator asks
// whether a room can host events. A real application would call it over the
// network; this one keeps the closed rooms in memory.
const closedRooms = new Set(['Basement'])

/** Answers asynchronously, like a remote service. */
export const isRoomOpen = async (room: string): Promise<boolean> => {
	await Promise.resolve()
	return !closedRooms.has(room)
}

/** Closes a room for future events; existing events keep their room. */
export const closeRoom = (room: string): void => {
	closedRooms.add(room)
}

export const reopenRoom = (room: string): void => {
	closedRooms.delete(room)
}
