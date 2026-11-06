// What a live message costs React at any list size (D-254): the list through
// `useLiveSubscription`, every row rendered, or `memo` rows, or only the rows a
// virtual list would show. On happy-dom: reconciliation and DOM writes count,
// a browser's layout and paint do not.
// `NODE_ENV=production node --max-old-space-size=16384 bench/realtime/render.ts`.
import { ApolloClient, ApolloLink, InMemoryCache, gql } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { Window } from 'happy-dom'
import { createElement, memo, useLayoutEffect } from 'react'
import { Subject } from 'rxjs'
import { ultimabaseLive } from '../../packages/live/src/apollo.ts'
import { useLiveSubscription } from '../../packages/live/src/react.ts'
import { median } from './shared.ts'

// React reads these globals as it commits: set before it loads.
const page = new Window()
Object.assign(globalThis, { window: page, document: page.document })
const { createRoot } = await import('react-dom/client')

const document = gql`
	subscription Items($first: Int) {
		items(first: $first) {
			edges {
				cursor
				node {
					__typename
					id
					title
					rank
					owner {
						__typename
						id
						name
					}
				}
			}
			pageInfo {
				hasNextPage
				endCursor
			}
			totalCount
		}
	}
`
type Node = {
	readonly id: string
	readonly title: string
	readonly owner: { readonly name: string }
}
type Edge = { readonly cursor: string; readonly node: Node }
type Items = { readonly items: { readonly edges: readonly Edge[] } }

const edge = (index: number, title = `title of row ${index}`) => ({
	__typename: 'ItemEdge',
	cursor: `c${index}`,
	node: {
		__typename: 'Item',
		id: `i${index}`,
		title,
		rank: index,
		owner: {
			__typename: 'User',
			id: `u${index % 50}`,
			name: `user ${index % 50}`,
		},
	},
})

/** The rows a virtual list keeps mounted. */
const shown = 30

type Variant = 'every row' | 'memo' | 'virtual'

async function run(rows: number, variant: Variant): Promise<string> {
	const server = new Subject<ApolloLink.Result>()
	const client = new ApolloClient({
		link: ApolloLink.from([ultimabaseLive(), new ApolloLink(() => server)]),
		cache: new InMemoryCache(),
	})
	let rendered = 0
	const Plain = ({ node }: { readonly node: Node }) => {
		rendered += 1
		return createElement(
			'li',
			null,
			createElement('b', null, node.title),
			createElement('span', null, node.owner.name),
		)
	}
	const Row = variant === 'memo' ? memo(Plain) : Plain
	let committed: (() => void) | undefined
	const List = () => {
		const { data } = useLiveSubscription<Items>(document, {
			variables: { first: rows },
		})
		useLayoutEffect(() => {
			if (data !== undefined) committed?.()
		}, [data])
		const edges = data?.items.edges ?? []
		const mounted = variant === 'virtual' ? middleOf(edges) : edges
		return createElement(
			'ul',
			null,
			mounted.map(({ node }) => createElement(Row, { key: node.id, node })),
		)
	}
	const root = createRoot(page.document.createElement('div'))
	root.render(
		createElement(ApolloProvider, { client, children: createElement(List) }),
	)
	// The hook subscribes once it commits, before which a message is lost.
	await new Promise((resolve) => setTimeout(resolve, 50))
	const sent = async (message: ApolloLink.Result): Promise<number> => {
		const start = performance.now()
		await new Promise<void>((resolve) => {
			committed = resolve
			server.next(message)
		})
		return performance.now() - start
	}
	const first = await sent({
		data: {
			items: {
				__typename: 'ItemConnection',
				edges: Array.from({ length: rows }, (_, i) => edge(i)),
				pageInfo: {
					__typename: 'PageInfo',
					hasNextPage: true,
					endCursor: `c${rows - 1}`,
				},
				totalCount: rows,
			},
		},
		extensions: { live: { revision: 1 } },
	})
	const middle = Math.floor(rows / 2)
	const updates: number[] = []
	let revision = 1
	let touched = 0
	const times = variant === 'every row' && rows >= 10_000 ? 5 : 25
	for (let index = 0; index < times; index += 1) {
		revision += 1
		rendered = 0
		updates.push(
			await sent({
				extensions: {
					live: {
						revision,
						changes: [
							{ upsert: edge(middle, `x${index}`), after: `i${middle - 1}` },
						],
					},
				},
			}),
		)
		touched = rendered
	}
	const gone = await sent({
		extensions: {
			live: {
				revision: revision + 1,
				changes: [{ remove: `i${middle}`, gone: true }],
			},
		},
	})
	root.unmount()
	return `| ${rows} | ${variant} | ${first.toFixed(1)} | ${median(updates).toFixed(2)} | ${gone.toFixed(1)} | ${touched} |`
}

/** The rows around the middle, where the benchmark writes. */
function middleOf(edges: readonly Edge[]): readonly Edge[] {
	const from = Math.max(0, Math.floor(edges.length / 2) - shown / 2)
	return edges.slice(from, from + shown)
}

console.log(
	`${new Date().toISOString().slice(0, 10)}, Node ${process.version}, React ${process.env.NODE_ENV ?? 'development'} build; times in ms.\n`,
)
console.log(
	'| Rows | Rendered | First message | Update p50 | Row gone | Rows rendered by an update |\n| --: | --- | --: | --: | --: | --: |',
)
for (const rows of [25, 2000, 10_000, 50_000]) {
	for (const variant of ['every row', 'memo', 'virtual'] as const) {
		console.log(await run(rows, variant))
	}
}
