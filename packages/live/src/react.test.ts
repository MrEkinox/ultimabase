// @vitest-environment happy-dom
// React's hook to a live subscription (D-154): a running server's list
// rendered, grown on the same socket and kept live; refused before it runs.
import { ApolloClient, ApolloLink, InMemoryCache, gql } from '@apollo/client'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { ApolloProvider } from '@apollo/client/react'
import type { Client } from 'graphql-ws'
import { createClient } from 'graphql-ws'
import { Window } from 'happy-dom'
import { createElement } from 'react'
import type { Root } from 'react-dom/client'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ultimabaseLive } from './apollo.ts'
import type { LiveSubscriptionResult } from './react.ts'
import { useLiveSubscription } from './react.ts'
import type { Running } from './test/server.ts'
import { M, Task, started } from './test/server.ts'

let running: Running | undefined
const roots: Root[] = []
const sockets: Client[] = []
afterEach(async () => {
	for (const root of roots.splice(0)) root.unmount()
	await Promise.all(sockets.splice(0).map(async (socket) => socket.dispose()))
	await running?.stop()
	running = undefined
})

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
const fixed = gql`
	subscription {
		tasks(first: 1) {
			edges {
				node {
					id
				}
			}
		}
	}
`

type Rendered = {
	/** The hook's latest result once `done` holds for it. */
	readonly until: (
		done: (result: LiveSubscriptionResult<unknown>) => boolean,
	) => Promise<LiveSubscriptionResult<unknown>>
	readonly results: LiveSubscriptionResult<unknown>[]
	readonly opened: () => number
}

/** Renders `use`, a hook call, under a client of a running server as Ada. */
async function rendered(
	use: () => LiveSubscriptionResult<unknown>,
): Promise<Rendered> {
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
	const client = new ApolloClient({
		link: ApolloLink.from([ultimabaseLive(), new GraphQLWsLink(socket)]),
		cache: new InMemoryCache(),
	})
	const results: LiveSubscriptionResult<unknown>[] = []
	const waiters: (() => void)[] = []
	const Watched = () => {
		results.push(use())
		for (const waiter of waiters.splice(0)) waiter()
		return null
	}
	// A happy-dom element, typed without the DOM library.
	const root = createRoot(new Window().document.createElement('div'))
	roots.push(root)
	root.render(
		createElement(ApolloProvider, { client, children: createElement(Watched) }),
	)
	return {
		until: async (done) => {
			for (;;) {
				const last = results.at(-1)
				if (last !== undefined && done(last)) return last
				await new Promise<void>((woken) => waiters.push(woken))
			}
		},
		results,
		opened: () => opened,
	}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null

/** The titles of the tasks' nodes in a result's data. */
function titles({ data }: LiveSubscriptionResult<unknown>): unknown {
	const list = isRecord(data) ? data['tasks'] : undefined
	const edges = isRecord(list) ? list['edges'] : undefined
	if (!Array.isArray(edges)) return data
	return edges.map((edge: unknown) =>
		isRecord(edge) && isRecord(edge['node']) ? edge['node']['title'] : edge,
	)
}

const showing =
	(...expected: readonly string[]) =>
	(result: LiveSubscriptionResult<unknown>) =>
		JSON.stringify(titles(result)) === JSON.stringify(expected)

describe('useLiveSubscription', () => {
	it('renders a live list, grows it on the same socket and keeps it live', async () => {
		const view = await rendered(() =>
			useLiveSubscription(tasks, { variables: { first: 2 } }),
		)
		const first = await view.until(showing('a', 'b'))
		await first.fetchMore({ first: 1 })
		await view.until(showing('a', 'b', 'c'))
		await Task.create({ data: { title: 'z', rank: 0, owner: 'ada' } }, M)
		const last = await view.until(showing('z', 'a', 'b'))
		expect(last.fetchMore).toBe(first.fetchMore)
		expect(view.opened()).toBe(1)
	})

	it('refuses to grow a list before it runs', async () => {
		const view = await rendered(() =>
			useLiveSubscription(tasks, { variables: { first: 2 }, skip: true }),
		)
		const idle = await view.until(({ loading }) => !loading)
		await expect(idle.fetchMore({ first: 1 })).rejects.toMatchObject({
			code: 'BAD_USER_INPUT',
			message: 'fetchMore grows a live subscription once it runs.',
		})
	})

	it('passes the link’s refusal of a list whose first is no variable', async () => {
		const view = await rendered(() => useLiveSubscription(fixed))
		const shown = await view.until(({ data }) => data !== undefined)
		await expect(shown.fetchMore({ first: 1 })).rejects.toThrow(
			'fetchMore grows a live list: its root field needs first or take from a variable.',
		)
	})
})
