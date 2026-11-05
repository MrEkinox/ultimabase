// The client of `pages.ts`, on a thread of its own in production mode: the list
// through `ultimabaseLive`, read plainly or through `useLiveSubscription`, one
// page after another. On happy-dom: a browser's layout and paint do not count.
import { parentPort } from 'node:worker_threads'
import { ApolloClient, ApolloLink, InMemoryCache, gql } from '@apollo/client'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { ApolloProvider } from '@apollo/client/react'
import { createClient } from 'graphql-ws'
import { Window } from 'happy-dom'
import { createElement, memo, useLayoutEffect, useRef } from 'react'
import { WebSocket } from 'ws'
import type { LiveControl } from '../../packages/live/src/apollo.ts'
import { ultimabaseLive } from '../../packages/live/src/apollo.ts'
import type { LiveChange } from '../../packages/live/src/apply.ts'
import { applyLive } from '../../packages/live/src/apply.ts'
import { useLiveSubscription } from '../../packages/live/src/react.ts'

export type Variant = 'link' | 'virtual' | 'memo' | 'every row'
export type Command = {
	readonly url: string
	readonly variant: Variant
	readonly target: number
	readonly milestones: readonly number[]
}
export type Page = {
	readonly size: number
	readonly rows: number
	readonly settled: number
}
export type Merge = {
	readonly size: number
	readonly page: number
	readonly author: number
}
export type Reply =
	| {
			readonly kind: 'done'
			readonly pages: readonly Page[]
			readonly merges: readonly Merge[]
	  }
	| { readonly kind: 'failed'; readonly message: string }

const window = new Window()
Object.assign(globalThis, { window, document: window.document })
// React reads its globals as it loads.
const { createRoot } = await import('react-dom/client')

const port = parentPort
if (port === null) throw new Error('This file runs as a worker.')
const reply = (message: Reply) => {
	port.postMessage(message)
}

const query = gql`
	subscription ($first: Int) {
		msgs(first: $first, orderBy: [{ rank: asc }]) {
			edges {
				cursor
				node {
					__typename
					id
					text
					rank
					author {
						__typename
						id
						name
					}
					parts(first: 8) {
						edges {
							node {
								__typename
								id
								url
							}
						}
					}
				}
			}
			pageInfo {
				hasNextPage
				endCursor
			}
		}
	}
`
type Node = {
	readonly id: string
	readonly text: string
	readonly author: { readonly name: string }
}
type Edge = { readonly cursor: string; readonly node: Node }
type Msgs = { readonly msgs: { readonly edges: readonly Edge[] } }

/** The median of seven `applyLive` of `changes` on `edges`, in ms. */
function applied(edges: readonly Edge[], changes: readonly LiveChange[]) {
	const list = { edges, pageInfo: {} }
	const times = Array.from({ length: 7 }, () => {
		const start = performance.now()
		applyLive(list, { revision: 2, changes })
		return performance.now() - start
	})
	return times.toSorted((a, b) => a - b)[3] ?? 0
}

/** What `applyLive` alone costs the list as it stands. */
function merged(edges: readonly Edge[]): Merge {
	const page = Array.from({ length: 25 }, (_, index) => ({
		upsert: { cursor: `new${index}`, node: { id: `new${index}` } },
		after: index === 0 ? (edges.at(-1)?.node.id ?? null) : `new${index - 1}`,
	}))
	// One row in 50 told again where it stands: an author it shows has changed.
	const author = edges.flatMap((edge, index) =>
		index % 50 === 0
			? [{ upsert: edge, after: edges[index - 1]?.node.id ?? null }]
			: [],
	)
	return {
		size: edges.length,
		page: applied(edges, page),
		author: applied(edges, author),
	}
}

async function viaLink(client: ApolloClient, command: Command): Promise<Reply> {
	const control: LiveControl = {}
	const pages: Page[] = []
	const merges: Merge[] = []
	let edges: readonly Edge[] = []
	let told: (() => void) | undefined
	const subscription = client
		.subscribe<Msgs>({
			query,
			variables: { first: 25 },
			fetchPolicy: 'no-cache',
			context: { live: control, queryDeduplication: false },
		})
		.subscribe({
			next: ({ data }) => {
				if (data) edges = data.msgs.edges
				told?.()
			},
			error: (error: unknown) => {
				reply({ kind: 'failed', message: String(error) })
			},
		})
	await new Promise<void>((resolve) => {
		told = resolve
	})
	for (let size = 50; size <= command.target; size += 25) {
		const start = performance.now()
		await control.fetchMore?.()
		const ms = performance.now() - start
		if (edges.length !== size) {
			throw new Error(`${edges.length} rows, ${size} expected.`)
		}
		pages.push({ size, rows: ms, settled: ms })
		if (command.milestones.includes(size)) merges.push(merged(edges))
	}
	subscription.unsubscribe()
	return { kind: 'done', pages, merges }
}

const Plain = ({ node }: { readonly node: Node }) =>
	createElement(
		'li',
		null,
		createElement('b', null, node.text),
		createElement('span', null, node.author.name),
	)

async function viaHook(client: ApolloClient, command: Command): Promise<Reply> {
	type Seen = { readonly size: number; readonly fetching: boolean }
	const pages: Page[] = []
	let onCommit: ((seen: Seen) => void) | undefined
	let grow: (() => Promise<void>) | undefined
	const Row = command.variant === 'memo' ? memo(Plain) : Plain
	const List = () => {
		const { data, fetchMore, fetchingMore, error } = useLiveSubscription<Msgs>(
			query,
			{ variables: { first: 25 } },
		)
		if (error) reply({ kind: 'failed', message: error.message })
		const held = useRef(fetchMore)
		held.current = fetchMore
		grow = async () => held.current()
		const edges = data?.msgs.edges ?? []
		useLayoutEffect(() => {
			onCommit?.({ size: edges.length, fetching: fetchingMore })
		})
		// A virtual list at its end, where a user who loads more stands.
		const mounted = command.variant === 'virtual' ? edges.slice(-30) : edges
		return createElement(
			'ul',
			null,
			mounted.map(({ node }) => createElement(Row, { key: node.id, node })),
		)
	}
	const appeared = new Promise<void>((resolve) => {
		onCommit = ({ size }) => {
			if (size === 25) resolve()
		}
	})
	const root = createRoot(window.document.createElement('div'))
	root.render(
		createElement(ApolloProvider, { client, children: createElement(List) }),
	)
	await appeared
	for (let size = 50; size <= command.target; size += 25) {
		const start = performance.now()
		let rows = 0
		const settled = new Promise<void>((resolve) => {
			onCommit = (seen) => {
				if (seen.size >= size && rows === 0) rows = performance.now() - start
				if (seen.size >= size && !seen.fetching) resolve()
			}
		})
		await grow?.()
		await settled
		pages.push({ size, rows, settled: performance.now() - start })
	}
	root.unmount()
	return { kind: 'done', pages, merges: [] }
}

port.once('message', (command: Command) => {
	const client = new ApolloClient({
		link: ApolloLink.from([
			ultimabaseLive(),
			new GraphQLWsLink(
				createClient({
					url: command.url,
					webSocketImpl: WebSocket,
					connectionParams: { authorization: 'u1' },
					retryAttempts: 0,
				}),
			),
		]),
		cache: new InMemoryCache(),
	})
	const read = command.variant === 'link' ? viaLink : viaHook
	read(client, command).then(reply, (error: unknown) => {
		reply({ kind: 'failed', message: String(error) })
	})
})
