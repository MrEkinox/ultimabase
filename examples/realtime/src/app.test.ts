// Follows the tasks as clients would: a GraphQL subscription over WebSocket,
// the same list over Server-Sent Events, a live row and a live function,
// each test on a new in-memory database.
import type { LiveMessage } from '@ultimabase/live'
import { LiveError, applyLive, liveFetch } from '@ultimabase/live'
import { testApplication } from '@ultimabase/testing'
import type { Client } from 'graphql-ws'
import { createClient } from 'graphql-ws'
import { master } from 'ultimabase'
import { afterEach, expect, it, vi } from 'vitest'
import { app } from './app.ts'
import { Task } from './models.ts'

const running = testApplication(app)
const M = { as: master } as const

const sockets: Client[] = []
const stops: (() => void)[] = []
afterEach(async () => {
	for (const stop of stops.splice(0)) stop()
	await Promise.all(sockets.splice(0).map(async (socket) => socket.dispose()))
})

//#region client
/** A graphql-ws client of the running application. */
function connected(): Client {
	const socket = createClient({
		url: `${running.url.replace(/^http/, 'ws')}/graphql`,
	})
	sockets.push(socket)
	return socket
}
//#endregion

/** The next result of a subscription. */
async function next<T>(results: AsyncIterator<T>): Promise<T> {
	const result = await results.next()
	if (result.done === true) throw new Error('The subscription completed.')
	return result.value
}

/** Tasks a, b and c, ranked 1 to 3; their ids. */
async function seeded(): Promise<string[]> {
	const ids: string[] = []
	for (const [rank, title] of [
		[1, 'a'],
		[2, 'b'],
		[3, 'c'],
	] as const) {
		ids.push((await Task.create({ data: { title, rank } }, M)).id)
	}
	return ids
}

type Tasks = {
	readonly tasks: {
		readonly edges: readonly {
			readonly node: { readonly id: string; readonly title: string }
		}[]
	}
}

const titles = (list: Tasks['tasks'] | undefined) =>
	list?.edges.map(({ node }) => node.title)

const anything: unknown = expect.anything()

it('sends a live list once, then only what changed', async () => {
	const [, b = ''] = await seeded()
	//#region list
	const results = connected().iterate<Tasks, { live: LiveMessage }>({
		query: `subscription {
			tasks(first: 2, orderBy: [{ rank: asc }]) {
				edges { node { id title } }
			}
		}`,
	})
	const first = await next(results)
	let tasks = first.data?.tasks
	expect(titles(tasks)).toEqual(['a', 'b'])

	const task = await Task.create({ data: { title: 'new', rank: 0 } }, M)
	const { extensions } = await next(results)
	expect(extensions?.live.changes).toEqual([
		{ remove: b, gone: false },
		{ upsert: { node: { id: task.id, title: 'new' } }, after: null },
	])
	if (tasks !== undefined && extensions !== undefined) {
		tasks = applyLive(tasks, extensions.live)
	}
	expect(titles(tasks)).toEqual(['new', 'a'])
	//#endregion
	expect(first.extensions?.live).toEqual({ revision: 1, resume: anything })
})

it('follows a row until it is deleted', async () => {
	const [a = ''] = await seeded()
	//#region row
	const results = connected().iterate({
		query: `subscription ($id: ID!) {
			task(where: { id: $id }) { title done }
		}`,
		variables: { id: a },
	})
	expect((await next(results)).data).toEqual({
		task: { title: 'a', done: false },
	})
	await Task.update({ where: { id: a }, data: { done: true } }, M)
	expect((await next(results)).data).toEqual({
		task: { title: 'a', done: true },
	})
	await Task.delete({ where: { id: a } }, M)
	expect((await next(results)).data).toEqual({ task: null })
	//#endregion
})

it('sends the whole window in page mode', async () => {
	await seeded()
	//#region page
	const results = connected().iterate<Tasks>({
		query: `subscription {
			tasks(first: 2, orderBy: [{ rank: asc }]) {
				edges { node { id title } }
			}
		}`,
		extensions: { live: { mode: 'page' } },
	})
	expect(titles((await next(results)).data?.tasks)).toEqual(['a', 'b'])
	await Task.create({ data: { title: 'new', rank: 0 } }, M)
	expect(titles((await next(results)).data?.tasks)).toEqual(['new', 'a'])
	//#endregion
})

it('runs a live function again when what it read changes', async () => {
	const [a = ''] = await seeded()
	//#region function
	const results = connected().iterate({
		query: 'subscription { tasksLeft }',
	})
	expect((await next(results)).data).toEqual({ tasksLeft: 3 })
	await Task.update({ where: { id: a }, data: { done: true } }, M)
	expect((await next(results)).data).toEqual({ tasksLeft: 2 })
	//#endregion
})

it('refuses a live list over its limits', async () => {
	//#region limits
	const results = connected().iterate({
		query: 'subscription { tasks(first: 60) { edges { node { id } } } }',
	})
	expect(await next(results)).toMatchObject({
		errors: [
			{
				message: 'first is over 50, the most a live list follows.',
				extensions: { code: 'VALIDATION_FAILED' },
			},
		],
	})

	// Over SSE, subscribe's second function gets the refusal, a LiveError.
	const tasks = liveFetch(`${running.url}/api/tasks?first=60`)
	const error = await new Promise<LiveError>((failed) => {
		stops.push(tasks.subscribe(() => undefined, failed))
	})
	expect(error).toBeInstanceOf(LiveError)
	expect(error).toMatchObject({
		code: 'VALIDATION_FAILED',
		message: 'first is over 50, the most a live list follows.',
	})
	//#endregion
})

it('follows a list over Server-Sent Events, and grows it', async () => {
	await seeded()
	//#region sse
	const orderBy = encodeURIComponent('[{"rank":"asc"}]')
	const tasks = liveFetch<Tasks['tasks']>(
		`${running.url}/api/tasks?first=2&orderBy=${orderBy}`,
	)
	const lists: Tasks['tasks'][] = []
	const stop = tasks.subscribe((list) => lists.push(list))
	await vi.waitFor(() => {
		expect(titles(lists.at(-1))).toEqual(['a', 'b'])
	})

	await tasks.fetchMore({ first: 1 })
	expect(titles(lists.at(-1))).toEqual(['a', 'b', 'c'])

	await Task.create({ data: { title: 'new', rank: 0 } }, M)
	await vi.waitFor(() => {
		expect(titles(lists.at(-1))).toEqual(['new', 'a', 'b'])
	})
	stop()
	//#endregion
})
