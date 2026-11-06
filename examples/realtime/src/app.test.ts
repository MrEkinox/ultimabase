// Follows the tasks as clients would: a GraphQL subscription over WebSocket,
// the same list over Server-Sent Events, a live row and a live function,
// each test on a new in-memory database. Each message of a subscription is
// compared with its file under requests/ (D-282).
import { requestFiles } from '../../../scripts/requests.ts'
import { LiveError, liveFetch } from '@ultimabase/live'
import { testApplication } from '@ultimabase/testing'
import type { Client } from 'graphql-ws'
import { createClient } from 'graphql-ws'
import { afterEach, expect, it, vi } from 'vitest'
import { app } from './app.ts'
import type { Tasks } from './follow.ts'
import { follow } from './follow.ts'
import { Task } from './models.ts'
import { M, next, seeded, titles } from './results.ts'

const running = testApplication(app)
const { document, matches } = requestFiles(
	new URL('requests/', import.meta.url),
	running,
)

const sockets: Client[] = []
const stops: (() => void)[] = []
afterEach(async () => {
	for (const stop of stops.splice(0)) stop()
	await Promise.all(sockets.splice(0).map(async (socket) => socket.dispose()))
})

/** A client of the running server, closed after the test. */
function connected() {
	const client = createClient({
		url: `${running.url.replace(/^http/, 'ws')}/graphql`,
	})
	sockets.push(client)
	return client
}

it('sends a live list once, then only what changed', async () => {
	await seeded()
	const results = connected().iterate({ query: document('tasks') })
	matches('tasks', await next(results))
	await Task.create({ data: { title: 'new', rank: 0 } }, M)
	matches('tasks-change', await next(results))
})

it('applies what changed to the list a client holds', async () => {
	await seeded()
	const client = connected()
	const lists: Tasks['tasks'][] = []
	const following = follow(client, document('tasks'), (tasks) => {
		lists.push(tasks)
	})
	await vi.waitFor(() => {
		expect(titles(lists.at(-1))).toEqual(['a', 'b'])
	})
	await Task.create({ data: { title: 'new', rank: 0 } }, M)
	await vi.waitFor(() => {
		expect(titles(lists.at(-1))).toEqual(['new', 'a'])
	})
	await client.dispose()
	await following
})

it('follows a row until it is deleted', async () => {
	const [a = ''] = await seeded()
	const results = connected().iterate({
		query: document('task'),
		variables: { id: a },
	})
	matches('task', await next(results))
	await Task.update({ where: { id: a }, data: { done: true } }, M)
	matches('task-done', await next(results))
	await Task.delete({ where: { id: a } }, M)
	matches('task-deleted', await next(results))
})

it('sends the whole window in page mode', async () => {
	await seeded()
	const client = connected()
	const query = document('tasks')
	//#region page
	const results = client.iterate({
		query,
		extensions: { live: { mode: 'page' } },
	})
	//#endregion
	matches('tasks-page', await next(results))
	await Task.create({ data: { title: 'new', rank: 0 } }, M)
	matches('tasks-page-change', await next(results))
})

it('runs a live function again when what it read changes', async () => {
	const [a = ''] = await seeded()
	const results = connected().iterate({ query: document('tasks-left') })
	matches('tasks-left', await next(results))
	await Task.update({ where: { id: a }, data: { done: true } }, M)
	matches('tasks-left-change', await next(results))
})

it('refuses a live list over its limits', async () => {
	const results = connected().iterate({ query: document('too-many') })
	matches('too-many', await next(results))
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
	const lists: Tasks['tasks'][] = []
	//#region sse
	const tasks = liveFetch<Tasks['tasks']>(
		`${running.url}/api/tasks?first=2&orderBy=[{"rank":"asc"}]`,
	)
	const stop = tasks.subscribe((list) => lists.push(list))
	//#endregion
	await vi.waitFor(() => {
		expect(titles(lists.at(-1))).toEqual(['a', 'b'])
	})

	//#region sse-more
	await tasks.fetchMore({ first: 1 })
	//#endregion
	expect(titles(lists.at(-1))).toEqual(['a', 'b', 'c'])

	await Task.create({ data: { title: 'new', rank: 0 } }, M)
	await vi.waitFor(() => {
		expect(titles(lists.at(-1))).toEqual(['new', 'a', 'b'])
	})
	stop()
})
