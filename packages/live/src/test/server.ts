// A running application for the client's tests: Ada's and Bob's tasks, live
// over REST and GraphQL, each request's `authorization` its user's id.
import { graphql, graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { realtime, realtimePlugin } from '@ultimabase/realtime'
import { rest, restPlugin } from '@ultimabase/rest'
import type { Caller, Identity, Logger, PluginTypes } from 'ultimabase'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'

export const M = { as: master } as const

const idOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''

/** A user reads their own tasks. */
export const Task = defineModel({
	name: 'Task',
	use: [rest(), graphql(), realtime()],
	fields: (f) => ({
		title: f.string(),
		rank: f.number({ integer: true }),
		owner: f.string(),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ owner: idOf(caller) }),
	},
})

/** What the application logged as errors. */
export const errors: unknown[] = []
let listening = ''
const logger: Logger = {
	info: (first: string | object) => {
		if (typeof first === 'string' && first.startsWith('Listening on')) {
			listening = first.replace(/^Listening on (.*)\.$/, '$1')
		}
	},
	warn: () => undefined,
	error: (first: string | object, message?: string) => {
		errors.push(message ?? first)
	},
	child: () => logger,
}

interface Sessions extends PluginTypes {
	readonly name: 'sessions'
}
const sessions = definePlugin<Sessions>({
	name: 'sessions',
	manifest: {
		name: 'sessions',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	identify: async (request): Promise<Identity | undefined> => {
		const id = request.headers.get('authorization')
		return id === null ? undefined : { kind: 'user', user: { id } }
	},
})

/** A running application: its origin, and what stops it. */
export type Running = {
	readonly origin: string
	readonly stop: () => Promise<void>
}

/** Starts the application with Ada's three tasks and Bob's one. */
export async function started(): Promise<Running> {
	const app = defineApp({
		database: memory(),
		plugins: [
			httpPlugin({ port: 0 }),
			realtimePlugin(),
			restPlugin(),
			graphqlPlugin(),
			sessions.plugin(),
		],
		models: [Task],
		masterKey: 'secret',
		logger,
	})
	await app.start()
	for (const [rank, title, owner] of [
		[1, 'a', 'ada'],
		[2, 'b', 'ada'],
		[3, 'c', 'ada'],
		[1, 'x', 'bob'],
	] as const) {
		await Task.create({ data: { title, rank, owner } }, M)
	}
	return {
		origin: listening,
		stop: async () => {
			errors.length = 0
			await app.stop()
		},
	}
}
