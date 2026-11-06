// Follows the tasks as clients would: a GraphQL subscription over WebSocket,
// the same list over Server-Sent Events, a live row and a live function,
// each test on a new in-memory database. Its short regions are shown on the
// page, with the helpers of results.ts around them (D-282).
import type { LiveMessage } from '@ultimabase/live'
import { LiveError, applyLive, liveFetch } from '@ultimabase/live'
import { testApplication } from '@ultimabase/testing'
import type { Client } from 'graphql-ws'
import { createClient } from 'graphql-ws'
import { afterEach, expect, it, vi } from 'vitest'
import { app } from './app.ts'
import { Task } from './models.ts'
import type { Tasks } from './results.ts'
import { M, next, seeded, titles } from './results.ts'

const running = testApplication(app)
const anything: unknown = expect.anything()

const sockets: Client[] = []
const stops: (() => void)[] = []
afterEach(async () => {
	for (const stop of stops.splice(0)) stop()
	await Promise.all(sockets.splice(0).map(async (socket) => socket.dispose()))
})

it('sends a live list once, then only what changed', async () => {
	const [, b = ''] = await seeded()
	const wsUrl = running.url.replace(/^http/, 'ws')
	//#region client
	const client = createClient({ url: `${wsUrl}/graphql` })
	const results = client.iterate<Tasks, { live: LiveMessage }>({
		query: `subscription {
			tasks(first: 2, orderBy: [{ rank: asc }]) {
				edges { node { id title } }
			}
		}`,
	})
	//#endregion
	sockets.push(client)
	//#region list
	const first = await next(results)
	let tasks = first.data?.tasks
	expect(titles(tasks)).toEqual(['a', 'b'])
	//#endregion
	expect(first.extensions?.live).toEqual({
		revision: 1,
		resume: anything,
	})

	//#region changes
	const task = await Task.create({ data: { title: 'new', rank: 0 } }, M)
	const { extensions } = await next(results)
	expect(extensions?.live.changes).toEqual([
		{ remove: b, gone: false },
		{ upsert: { node: { id: task.id, title: 'new' } }, after: null },
	])
	//#endregion
	//#region apply
	if (tasks !== undefined && extensions !== undefined) {
		tasks = applyLive(tasks, extensions.live)
	}
	expect(titles(tasks)).toEqual(['new', 'a'])
	//#endregion
})

it('follows a row until it is deleted', async () => {
	const [a = ''] = await seeded()
	const client = createClient({
		url: `${running.url.replace(/^http/, 'ws')}/graphql`,
	})
	sockets.push(client)
	//#region row
	const results = client.iterate({
		query: `subscription ($id: ID!) {
			task(where: { id: $id }) { title done }
		}`,
		variables: { id: a },
	})
	expect((await next(results)).data).toEqual({
		task: { title: 'a', done: false },
	})
	//#endregion
	//#region row-change
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
	const client = createClient({
		url: `${running.url.replace(/^http/, 'ws')}/graphql`,
	})
	sockets.push(client)
	//#region page
	const results = client.iterate<Tasks>({
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
	const client = createClient({
		url: `${running.url.replace(/^http/, 'ws')}/graphql`,
	})
	sockets.push(client)
	//#region function
	const results = client.iterate({ query: 'subscription { tasksLeft }' })
	expect((await next(results)).data).toEqual({ tasksLeft: 3 })
	await Task.update({ where: { id: a }, data: { done: true } }, M)
	expect((await next(results)).data).toEqual({ tasksLeft: 2 })
	//#endregion
})

it('refuses a live list over its limits', async () => {
	const client = createClient({
		url: `${running.url.replace(/^http/, 'ws')}/graphql`,
	})
	sockets.push(client)
	//#region limits
	const results = client.iterate({
		query: 'subscription { tasks(first: 60) { edges { node { id } } } }',
	})
	const refused = await next(results)
	expect(refused).toMatchObject({
		errors: [{ extensions: { details: { limit: 50, rows: 60 } } }],
	})
	//#endregion
	expect(refused).toMatchObject({
		errors: [
			{
				message: 'first is over 50, the most a live list follows.',
				extensions: { code: 'VALIDATION_FAILED' },
			},
		],
	})
})

it('refuses a live list over its limits, over Server-Sent Events', async () => {
	//#region limits-sse
	const tasks = liveFetch(`${running.url}/api/tasks?first=60`)
	const error = await new Promise<LiveError>((failed) => {
		stops.push(tasks.subscribe(() => undefined, failed))
	})
	expect(error).toBeInstanceOf(LiveError)
	expect(error).toMatchObject({
		code: 'VALIDATION_FAILED',
		message: 'first is over 50, the most a live list follows.',
		details: { limit: 50, rows: 60 },
	})
	//#endregion
})

it('follows a list over Server-Sent Events, and grows it', async () => {
	await seeded()
	//#region sse
	const tasks = liveFetch<Tasks['tasks']>(
		`${running.url}/api/tasks?first=2&orderBy=[{"rank":"asc"}]`,
	)
	const lists: Tasks['tasks'][] = []
	const stop = tasks.subscribe((list) => lists.push(list))
	await vi.waitFor(() => {
		expect(titles(lists.at(-1))).toEqual(['a', 'b'])
	})
	//#endregion

	//#region sse-more
	await tasks.fetchMore({ first: 1 })
	expect(titles(lists.at(-1))).toEqual(['a', 'b', 'c'])

	await Task.create({ data: { title: 'new', rank: 0 } }, M)
	await vi.waitFor(() => {
		expect(titles(lists.at(-1))).toEqual(['new', 'a', 'b'])
	})
	//#endregion
	stop()
})
