// Apollo's link to live subscriptions (D-154): a running server's list
// applied, grown on the same socket, its gone rows evicted; out of step, it
// reads the list afresh.
import { ApolloClient, ApolloLink, InMemoryCache, gql } from '@apollo/client'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import type { Client } from 'graphql-ws'
import { createClient } from 'graphql-ws'
import { Observable } from 'rxjs'
import { afterEach, describe, expect, it } from 'vitest'
import type { LiveControl } from './apollo.ts'
import { ultimabaseLive } from './apollo.ts'
import type { Running } from './test/server.ts'
import { M, Task, started } from './test/server.ts'

let running: Running | undefined
const sockets: Client[] = []
const stops: (() => void)[] = []
afterEach(async () => {
	for (const stop of stops.splice(0)) stop()
	await Promise.all(sockets.splice(0).map(async (socket) => socket.dispose()))
	await running?.stop()
	running = undefined
})

/** A client of a running server as Ada, and how many sockets it opened. */
async function connected(): Promise<{
	readonly client: ApolloClient
	readonly opened: () => number
}> {
	running = await started()
	let opened = 0
	const socket = createClient({
		url: `${running.origin.replace(/^http/, 'ws')}/graphql`,
		connectionParams: { authorization: 'ada' },
		retryAttempts: 0,
		on: {
			connected: () => {
				opened += 1
			},
		},
	})
	sockets.push(socket)
	const link = ApolloLink.from([ultimabaseLive(), new GraphQLWsLink(socket)])
	return {
		client: new ApolloClient({ link, cache: new InMemoryCache() }),
		opened: () => opened,
	}
}

type Seen = {
	readonly at: (count: number) => Promise<unknown>
	readonly results: unknown[]
	readonly failed: () => Promise<unknown>
}

/** Subscribes to `observable`, keeping its data and its error. */
function seen(
	observable: Observable<{ readonly data?: unknown; readonly error?: unknown }>,
): Seen {
	const results: unknown[] = []
	const errors: unknown[] = []
	const waiters: (() => void)[] = []
	const wake = () => {
		for (const waiter of waiters.splice(0)) waiter()
	}
	const subscription = observable.subscribe({
		next: ({ data, error }) => {
			if (error === undefined) results.push(data)
			else errors.push(error)
			wake()
		},
		error: (error: unknown) => {
			errors.push(error)
			wake()
		},
	})
	stops.push(() => {
		subscription.unsubscribe()
	})
	const until = async (done: () => boolean) => {
		while (!done()) await new Promise<void>((woken) => waiters.push(woken))
	}
	return {
		at: async (count) => {
			await until(() => results.length >= count)
			return results[count - 1]
		},
		results,
		failed: async () => {
			await until(() => errors.length > 0)
			return errors[0]
		},
	}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null

/** The titles of the tasks' nodes in `data`. */
function titles(data: unknown): unknown {
	const tasks = isRecord(data) ? data['tasks'] : undefined
	const edges = isRecord(tasks) ? tasks['edges'] : undefined
	if (!Array.isArray(edges)) return data
	return edges.map((edge: unknown) =>
		isRecord(edge) && isRecord(edge['node']) ? edge['node']['title'] : edge,
	)
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
			pageInfo {
				hasNextPage
			}
		}
	}
`

describe('ultimabaseLive', () => {
	it('applies a live list’s changes and evicts the rows gone', async () => {
		const { client } = await connected()
		const watched = seen(
			client.subscribe({ query: tasks, variables: { first: 2 } }),
		)
		expect(titles(await watched.at(1))).toEqual(['a', 'b'])
		await Task.create({ data: { title: 'z', rank: 0, owner: 'ada' } }, M)
		expect(titles(await watched.at(2))).toEqual(['z', 'a'])
		const [a] = await Task.findMany({ where: { title: 'a' } }, M)
		const id = a?.id ?? ''
		expect(client.cache.extract()).toHaveProperty(`Task:${id}`)
		await Task.delete({ where: { id } }, M)
		expect(titles(await watched.at(3))).toEqual(['z', 'b'])
		expect(client.cache.extract()).not.toHaveProperty(`Task:${id}`)
	})

	it('grows a list on the same socket, even with no row to add', async () => {
		const { client, opened } = await connected()
		const live: LiveControl = {}
		const watched = seen(
			client.subscribe({
				query: tasks,
				variables: { first: 2 },
				context: { live, queryDeduplication: false },
			}),
		)
		await watched.at(1)
		await live.fetchMore?.({ first: 2 })
		expect(titles(watched.results.at(-1))).toEqual(['a', 'b', 'c'])
		await live.fetchMore?.({ first: 1 })
		expect(watched.results.map(titles)).toEqual([
			['a', 'b'],
			['a', 'b', 'c'],
			['a', 'b', 'c'],
		])
		expect(opened()).toBe(1)
	})

	it('hands a live row whole', async () => {
		const { client } = await connected()
		const [a] = await Task.findMany({ where: { title: 'a' } }, M)
		const row = gql`
			subscription ($id: ID!) {
				task(where: { id: $id }) {
					id
					title
				}
			}
		`
		const watched = seen(
			client.subscribe({ query: row, variables: { id: a?.id } }),
		)
		expect(await watched.at(1)).toMatchObject({ task: { title: 'a' } })
		await Task.update({ where: { id: a?.id ?? '' }, data: { title: 'A' } }, M)
		expect(await watched.at(2)).toMatchObject({ task: { title: 'A' } })
	})

	it('refuses to grow a list whose first is no variable, or by a bad count', async () => {
		const { client } = await connected()
		const live: LiveControl = {}
		const fixed = gql`
			subscription {
				tasks(first: 2) {
					edges {
						node {
							id
						}
					}
				}
			}
		`
		seen(client.subscribe({ query: fixed, context: { live } }))
		await expect(live.fetchMore?.({ first: 1 })).rejects.toMatchObject({
			code: 'BAD_USER_INPUT',
			message:
				'fetchMore grows a live list: its root field needs first or take from a variable.',
		})
		const growing: LiveControl = {}
		seen(
			client.subscribe({
				query: tasks,
				variables: { first: 2 },
				context: { live: growing },
			}),
		)
		await expect(growing.fetchMore?.({ first: 0 })).rejects.toThrow(
			'first must be a positive integer.',
		)
	})
})

type Sent = {
	readonly variables: unknown
	readonly extensions: unknown
}

/** A client whose server answers each subscription with `answers` in turn. */
function answering(...answers: readonly (readonly unknown[])[]): {
	readonly client: ApolloClient
	readonly sent: Sent[]
} {
	const sent: Sent[] = []
	const server = new ApolloLink(
		({ variables, extensions, operationType }) =>
			new Observable((observer) => {
				sent.push({ variables, extensions })
				const answer = answers[sent.length - 1]
				if (answer === undefined || answer.length === 0) {
					return observer.complete()
				}
				for (const result of answer) {
					if (result instanceof Error) return observer.error(result)
					// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- what a test's server answers.
					observer.next(result as ApolloLink.Result)
				}
				// A subscription stays open.
				if (operationType === 'query') observer.complete()
				return undefined
			}),
	)
	const link = ApolloLink.from([ultimabaseLive(), server])
	return {
		client: new ApolloClient({
			link,
			cache: new InMemoryCache(),
		}),
		sent,
	}
}

const list = gql`
	subscription ($take: Int) {
		all: tasks(take: $take) {
			id
		}
	}
`
const unstored = { query: list, fetchPolicy: 'no-cache' } as const
const rows = (revision: number, ids: readonly string[], resume?: string) => ({
	data: { all: ids.map((id) => ({ id })) },
	extensions: { live: { revision, ...(resume !== undefined && { resume }) } },
})
const changes = (revision: number, ...changed: readonly unknown[]) => ({
	extensions: { live: { revision, changes: changed } },
})

describe('ultimabaseLive out of step', () => {
	it('reads the list afresh when a revision is missed or a row is unknown', async () => {
		const { client, sent } = answering(
			[rows(1, ['a'], 't'), changes(3)],
			[rows(1, ['a'], 'u'), changes(2, { remove: 'x' })],
			[changes(2)],
			[rows(1, ['c'])],
		)
		const watched = seen(
			client.subscribe({ ...unstored, variables: { take: 1 } }),
		)
		expect(await watched.at(3)).toEqual({ all: [{ id: 'c' }] })
		expect(sent.map(({ extensions }) => extensions)).toEqual([{}, {}, {}, {}])
	})

	it('grows with its token, keeps the live extension and passes results that are not live', async () => {
		const { client, sent } = answering(
			[{ data: { all: [] } }, rows(1, ['a'], 't')],
			[
				changes(
					2,
					{ upsert: { id: 'b' }, after: 'a' },
					{ remove: 'a', gone: true },
				),
			],
		)
		const live: LiveControl = {}
		const watched = seen(
			client.subscribe({
				...unstored,
				variables: { take: 1 },
				context: { live },
				extensions: { live: { mode: 'page' } },
			}),
		)
		await watched.at(2)
		await live.fetchMore?.({ first: 1 })
		expect(watched.results).toEqual([
			{ all: [] },
			{ all: [{ id: 'a' }] },
			{ all: [{ id: 'b' }] },
		])
		expect(sent).toEqual([
			{ variables: { take: 1 }, extensions: { live: { mode: 'page' } } },
			{
				variables: { take: 2 },
				extensions: { live: { mode: 'page', resume: 't' } },
			},
		])
	})

	it('fails a grow with the error that ends it, and needs the rows’ ids', async () => {
		const { client } = answering(
			[rows(1, ['a'])],
			[new Error('The socket closed.')],
			[
				{
					data: { all: [{ title: 'a' }] },
					extensions: { live: { revision: 1 } },
				},
				changes(2, { remove: 'a' }),
			],
		)
		const live: LiveControl = {}
		const ended = seen(
			client.subscribe({
				...unstored,
				variables: { take: 1 },
				context: { live },
			}),
		)
		await ended.at(1)
		await expect(live.fetchMore?.({ first: 1 })).rejects.toThrow(
			'The socket closed.',
		)
		expect(await ended.failed()).toBeDefined()
		const anonymous = seen(
			client.subscribe({ ...unstored, variables: { take: 2 } }),
		)
		expect(await anonymous.failed()).toMatchObject({
			message: "Select the node's id to follow a live list.",
		})
	})

	it('settles a grow once it completes, then grows only its variable', async () => {
		const { client, sent } = answering([rows(1, ['a'])], [])
		const live: LiveControl = {}
		const watched = seen(
			client.subscribe({
				...unstored,
				variables: { take: 1 },
				context: { live },
			}),
		)
		await watched.at(1)
		// The second subscription completes at once, which ends the first.
		await live.fetchMore?.({ first: 1 })
		await live.fetchMore?.({ first: 1 })
		expect(sent.map(({ variables }) => variables)).toEqual([
			{ take: 1 },
			{ take: 2 },
		])
	})

	it('passes a query, and a subscription with no root field', async () => {
		const { client, sent } = answering(
			[{ data: { all: [{ id: 'a' }] } }],
			[
				{
					data: { __typename: 'Subscription' },
					extensions: { live: { revision: 1 } },
				},
			],
		)
		const read = await client.query({
			query: gql`
				query {
					all: tasks {
						id
					}
				}
			`,
			fetchPolicy: 'no-cache',
		})
		expect(read.data).toEqual({ all: [{ id: 'a' }] })
		const typed = seen(
			client.subscribe({
				query: gql`
					subscription {
						__typename
					}
				`,
				fetchPolicy: 'no-cache',
			}),
		)
		expect(await typed.at(1)).toEqual({ __typename: 'Subscription' })
		expect(sent).toHaveLength(2)
	})
})
