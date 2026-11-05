// What a live message costs the client at any list size, through the link
// (D-252): read as `useLiveSubscription` does, and with a plain subscription.
// React's rendering is not counted.
// `node --max-old-space-size=8192 bench/realtime/hook.ts`.
import { ApolloClient, ApolloLink, InMemoryCache, gql } from '@apollo/client'
import { Subject } from 'rxjs'
import { ultimabaseLive } from '../../packages/live/src/apollo.ts'
import { median } from './shared.ts'

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

async function run(rows: number, hook: boolean): Promise<string> {
	const server = new Subject<ApolloLink.Result>()
	const client = new ApolloClient({
		link: ApolloLink.from([ultimabaseLive(), new ApolloLink(() => server)]),
		cache: new InMemoryCache(),
	})
	let told: (() => void) | undefined
	const subscription = client
		.subscribe({
			query: document,
			variables: { first: rows },
			...(hook && { fetchPolicy: 'no-cache', context: { live: {} } }),
		})
		.subscribe(() => {
			told?.()
		})
	const sent = async (message: ApolloLink.Result): Promise<number> => {
		const start = performance.now()
		await new Promise<void>((resolve) => {
			told = resolve
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
	const times = !hook && rows >= 10_000 ? 3 : 25
	for (let index = 0; index < times; index += 1) {
		revision += 1
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
	}
	const gone = await sent({
		extensions: {
			live: {
				revision: revision + 1,
				changes: [{ remove: `i${middle}`, gone: true }],
			},
		},
	})
	subscription.unsubscribe()
	return `| ${rows} | ${hook ? 'hook' : 'plain'} | ${first.toFixed(1)} | ${median(updates).toFixed(2)} | ${gone.toFixed(1)} |`
}

console.log(
	`${new Date().toISOString().slice(0, 10)}, Node ${process.version}; times in ms.\n`,
)
console.log(
	'| Rows | Read | First message | Update p50 | Row gone |\n| --: | --- | --: | --: | --: |',
)
for (const rows of [25, 1000, 10_000, 50_000]) {
	for (const hook of [true, false]) console.log(await run(rows, hook))
}
