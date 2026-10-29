// The model: tasks that clients follow live, and a live count of those left.
import { graphql } from '@ultimabase/graphql'
import { realtime } from '@ultimabase/realtime'
import { rest } from '@ultimabase/rest'
import { allow, defineFunction, defineModel } from 'ultimabase'
import { z } from 'zod'

//#region task
export const Task = defineModel({
	name: 'Task',
	// Live over GraphQL and REST.
	use: [graphql(), rest(), realtime()],
	fields: (f) => ({
		title: f.string(),
		rank: f.number({ integer: true }),
		done: f.boolean({ default: false }),
	}),
}).with({
	// Open to every client, to keep the example on realtime.
	access: allow.public,
	// A live list follows at most 50 tasks; 1000 by default.
	realtime: { maxLive: 50 },
})
//#endregion

//#region left
// A query function whose `use` lists realtime() is live too.
export const tasksLeft = defineFunction({
	name: 'tasksLeft',
	query: true,
	use: [realtime()],
	output: z.int(),
	run: async ({ caller }) =>
		Task.count({ where: { done: false } }, { as: caller }),
}).with({ access: allow.public })
//#endregion
