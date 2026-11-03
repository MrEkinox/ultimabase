//#region job
// The calls, whose video room closes in a job ten minutes after they end.
import { defineJob } from '@ultimabase/jobs'
import { defineModel } from 'ultimabase'
import { z } from 'zod'
import { closeVideoRoom } from './services.ts'

export const closeRoom = defineJob({
	name: 'closeRoom',
	// Validated when the run is enqueued, and stored with it.
	input: z.object({ room: z.string() }),
	// A run may run twice, after a crash: `id`, the run's, is the key that
	// makes the service close the room once.
	run: ({ input, id }) => {
		closeVideoRoom(input.room, { key: id })
	},
})
//#endregion

//#region enqueue
export const Call = defineModel({
	name: 'Call',
	fields: (f) => ({
		room: f.string(),
		endedAt: f.dateTime({ optional: true }),
	}),
}).with({
	hooks: {
		// In the write's transaction: the run exists if the update commits.
		afterUpdate: async ({ record, previous }) => {
			if (previous.endedAt !== null || record.endedAt === null) return
			// In milliseconds: the room stays open ten minutes, to rejoin.
			await closeRoom.enqueue({ room: record.room }, { after: 10 * 60 * 1000 })
		},
	},
})
//#endregion
