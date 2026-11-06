// A live read's rows in the cache (D-252): a read with a control, as the hook's,
// writes each row alone, holds it against collections and leaves no list.
import type { DocumentNode } from '@apollo/client'
import { ApolloClient, ApolloLink, InMemoryCache, gql } from '@apollo/client'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import type { Client } from 'graphql-ws'
import { createClient } from 'graphql-ws'
import { Observable } from 'rxjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveControl } from './apollo.ts'
import { ultimabaseLive } from './apollo.ts'
import type { Running } from './test/server.ts'
import { M, Task, started } from './test/server.ts'

let running: Running | undefined
const sockets: Client[] = []
const stops: (() => void)[] = []
afterEach(async () => {
	vi.useRealTimers()
	for (const stop of stops.splice(0)) stop()
	await Promise.all(sockets.splice(0).map(async (socket) => socket.dispose()))
	await running?.stop()
	running = undefined
})

/** A client of a running server as Ada. */
async function connected(
	options: {
		readonly cache?: InMemoryCache
		readonly dataMasking?: boolean
	} = {},
): Promise<{ readonly client: ApolloClient; readonly cache: InMemoryCache }> {
	running = await started()
	const socket = createClient({
		url: `${running.origin.replace(/^http/, 'ws')}/graphql`,
		connectionParams: { authorization: 'ada' },
		retryAttempts: 0,
	})
	sockets.push(socket)
	const cache = options.cache ?? new InMemoryCache()
	const link = ApolloLink.from([ultimabaseLive(), new GraphQLWsLink(socket)])
	return {
		client: new ApolloClient({
			link,
			cache,
			dataMasking: options.dataMasking ?? false,
		}),
		cache,
	}
}

/**
 * Follows `query` as the hook does; `at` resolves once `count` results came,
 * and `stop` closes the read.
 */
function followed(
	client: ApolloClient,
	query: DocumentNode,
	variables: Record<string, unknown>,
	live: LiveControl | undefined = {},
): {
	readonly at: (count: number) => Promise<unknown>
	readonly stop: () => void
} {
	const results: unknown[] = []
	const waiters: (() => void)[] = []
	const subscription = client
		.subscribe({
			query,
			variables,
			fetchPolicy: 'no-cache',
			context: { live },
		})
		.subscribe(({ data }) => {
			results.push(data)
			for (const waiter of waiters.splice(0)) waiter()
		})
	const stop = () => {
		subscription.unsubscribe()
	}
	stops.push(stop)
	return {
		at: async (count) => {
			while (results.length < count) {
				await new Promise<void>((woken) => waiters.push(woken))
			}
			return results[count - 1]
		},
		stop,
	}
}

const tasks = gql`
	subscription ($first: Int) {
		tasks(first: $first, orderBy: [{ rank: asc }]) {
			edges {
				node {
					id
					title
				}
			}
		}
	}
`
const title = gql`
	fragment Title on Task {
		title
	}
`
const idOf = async (name: string): Promise<string> => {
	const [row] = await Task.findMany({ where: { title: name } }, M)
	return row?.id ?? ''
}
const titleOf = (cache: InMemoryCache, id: string): unknown =>
	cache.readFragment({ id: `Task:${id}`, fragment: title })

/** A client of a server that sends `messages` and stays open. */
const sent = (messages: readonly ApolloLink.Result[]) => {
	const cache = new InMemoryCache()
	const server = new ApolloLink(
		() =>
			new Observable((observer) => {
				for (const message of messages) observer.next(message)
			}),
	)
	const client = new ApolloClient({
		link: ApolloLink.from([ultimabaseLive(), server]),
		cache,
	})
	const plain = gql`
		subscription {
			all: tasks {
				id
				title
			}
		}
	`
	return { cache, read: followed(client, plain, {}) }
}
const row = { __typename: 'Task', id: 'a', title: 'a' }

describe('a live read’s rows in the cache', () => {
	it('keeps each row, and no list', async () => {
		const { client, cache } = await connected()
		const read = followed(client, tasks, { first: 2 })
		await read.at(1)
		const a = await idOf('a')
		const stored = cache.extract()
		expect(stored[`Task:${a}`]).toMatchObject({ title: 'a' })
		expect(
			Object.keys(stored).filter((key) => key.startsWith('Task:')),
		).toHaveLength(2)
		expect(stored['ROOT_SUBSCRIPTION']).toBeUndefined()
	})

	it('writes what a message changed, and what a growth adds', async () => {
		const { client, cache } = await connected()
		const live: LiveControl = {}
		const read = followed(client, tasks, { first: 2 }, live)
		await read.at(1)
		const written = vi.spyOn(cache, 'writeFragment')
		const a = await idOf('a')
		await Task.update({ where: { id: a }, data: { title: 'A' } }, M)
		await read.at(2)
		expect(written).toHaveBeenCalledTimes(1)
		expect(titleOf(cache, a)).toMatchObject({ title: 'A' })
		await live.fetchMore?.({ first: 1 })
		expect(written).toHaveBeenCalledTimes(2)
		expect(titleOf(cache, await idOf('c'))).toMatchObject({ title: 'c' })
	})

	it('holds its rows against a collection until it closes', async () => {
		const { client, cache } = await connected()
		const read = followed(client, tasks, { first: 2 })
		await read.at(1)
		const a = await idOf('a')
		await Task.update({ where: { id: a }, data: { title: 'A' } }, M)
		await read.at(2)
		cache.gc()
		expect(titleOf(cache, a)).toMatchObject({ title: 'A' })
		read.stop()
		expect(titleOf(cache, a)).toMatchObject({ title: 'A' })
		cache.gc()
		expect(titleOf(cache, a)).toBeNull()
	})

	it('evicts a row gone, and lets a collection take a row that left', async () => {
		const { client, cache } = await connected()
		const read = followed(client, tasks, { first: 2 })
		await read.at(1)
		const [a, b] = [await idOf('a'), await idOf('b')]
		await Task.create({ data: { title: 'z', rank: 0, owner: 'ada' } }, M)
		await read.at(2)
		expect(titleOf(cache, b)).toMatchObject({ title: 'b' })
		cache.gc()
		expect(titleOf(cache, b)).toBeNull()
		await Task.delete({ where: { id: a } }, M)
		await read.at(3)
		expect(titleOf(cache, a)).toBeNull()
	})

	it('collects what gone rows left once, a moment after they went', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout'] })
		const { cache, read } = sent([
			{
				data: { all: [row, { ...row, id: 'b', title: 'b' }] },
				extensions: { live: { revision: 1 } },
			},
			{
				extensions: {
					live: { revision: 2, changes: [{ remove: 'a', gone: true }] },
				},
			},
			{
				extensions: {
					live: { revision: 3, changes: [{ remove: 'b', gone: true }] },
				},
			},
		])
		const collected = vi.spyOn(cache, 'gc')
		await read.at(3)
		expect(titleOf(cache, 'a')).toBeNull()
		expect(collected).not.toHaveBeenCalled()
		vi.advanceTimersByTime(1000)
		expect(collected).toHaveBeenCalledTimes(1)
		vi.advanceTimersByTime(1000)
		expect(collected).toHaveBeenCalledTimes(1)
	})

	it('keeps a live row, until it is gone', async () => {
		const { client, cache } = await connected()
		const id = await idOf('a')
		const live = gql`
			subscription ($id: ID!) {
				task(where: { id: $id }) {
					id
					title
				}
			}
		`
		const read = followed(client, live, { id })
		await read.at(1)
		cache.gc()
		expect(titleOf(cache, id)).toMatchObject({ title: 'a' })
		await Task.update({ where: { id }, data: { title: 'A' } }, M)
		await read.at(2)
		expect(titleOf(cache, id)).toMatchObject({ title: 'A' })
		await Task.delete({ where: { id } }, M)
		await read.at(3)
		cache.gc()
		expect(titleOf(cache, id)).toBeNull()
	})

	it('finds the row’s fields through fragments, and merges them', async () => {
		const { client, cache } = await connected()
		const split = gql`
			subscription ($first: Int) {
				tasks(first: $first, orderBy: [{ rank: asc }]) {
					...Edges
					edges {
						node {
							id
						}
					}
				}
			}
			fragment Edges on TaskConnection {
				edges {
					... {
						node {
							...Row
						}
					}
				}
			}
			fragment Row on Task {
				title
				rank
			}
		`
		const read = followed(client, split, { first: 1 })
		await read.at(1)
		const a = await idOf('a')
		await Task.update({ where: { id: a }, data: { rank: 0, title: 'A' } }, M)
		await read.at(2)
		expect(cache.extract()[`Task:${a}`]).toMatchObject({ title: 'A', rank: 0 })
	})

	it('leaves the cache alone without a control', async () => {
		const { client, cache } = await connected()
		const subscription = client.subscribe({
			query: tasks,
			variables: { first: 2 },
			fetchPolicy: 'no-cache',
		})
		const first = new Promise((resolve) => {
			stops.push(() => {
				inner.unsubscribe()
			})
			const inner = subscription.subscribe(resolve)
		})
		await first
		expect(cache.extract()).toEqual({})
	})

	it('writes past an optimistic layer', async () => {
		const { client, cache } = await connected()
		const read = followed(client, tasks, { first: 2 })
		await read.at(1)
		const a = await idOf('a')
		cache.recordOptimisticTransaction((layer) => {
			layer.modify({ id: `Task:${a}`, fields: { title: () => 'guess' } })
		}, 'guess')
		await Task.update({ where: { id: a }, data: { title: 'A' } }, M)
		await read.at(2)
		cache.removeOptimistic('guess')
		expect(titleOf(cache, a)).toMatchObject({ title: 'A' })
	})

	it('writes a masked fragment’s fields', async () => {
		const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
		const { client, cache } = await connected({ dataMasking: true })
		const masked = gql`
			subscription ($first: Int) {
				tasks(first: $first, orderBy: [{ rank: asc }]) {
					edges {
						node {
							id
							...Title
						}
					}
				}
			}
			${title}
		`
		const read = followed(client, masked, { first: 1 })
		await read.at(1)
		const a = await idOf('a')
		await Task.update({ where: { id: a }, data: { title: 'A' } }, M)
		await read.at(2)
		expect(titleOf(cache, a)).toMatchObject({ title: 'A' })
		warned.mockRestore()
	})

	it('leaves out a row the cache cannot name', async () => {
		const { client, cache } = await connected({
			cache: new InMemoryCache({
				typePolicies: { Task: { keyFields: false } },
			}),
		})
		await followed(client, tasks, { first: 1 }).at(1)
		expect(cache.extract()).toEqual({})
	})

	it('writes to a cache that holds no row', async () => {
		const plain = new Proxy(new InMemoryCache(), {
			has: (target, key) => key !== 'release' && Reflect.has(target, key),
		})
		const { client, cache } = await connected({ cache: plain })
		const read = followed(client, tasks, { first: 1 })
		await read.at(1)
		const a = await idOf('a')
		await Task.delete({ where: { id: a } }, M)
		await read.at(2)
		read.stop()
		expect(titleOf(cache, a)).toBeNull()
	})

	it('writes the rows of a plain list', async () => {
		const { cache, read } = sent([
			{ data: { all: [row] }, extensions: { live: { revision: 1 } } },
			{
				extensions: {
					live: {
						revision: 2,
						changes: [{ upsert: { ...row, id: 'b', title: 'b' }, after: 'a' }],
					},
				},
			},
		])
		await read.at(2)
		expect(titleOf(cache, 'a')).toMatchObject({ title: 'a' })
		expect(titleOf(cache, 'b')).toMatchObject({ title: 'b' })
	})

	it('leaves out what is no row', async () => {
		const { cache, read } = sent([
			{
				data: { all: [row, 'odd', { __typename: 'Task' }] },
				extensions: { live: { revision: 1 } },
			},
		])
		await read.at(1)
		expect(
			Object.keys(cache.extract()).filter((key) => key !== '__META'),
		).toEqual(['Task:a'])
	})
})
