// A React component that follows the tasks live through Apollo, and shows
// more on demand.
import { ApolloClient, ApolloLink, InMemoryCache, gql } from '@apollo/client'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { ultimabaseLive } from '@ultimabase/live/apollo'
import { useLiveSubscription } from '@ultimabase/live/react'
import type { Client } from 'graphql-ws'

//#region apollo
/** An Apollo client whose subscriptions go over `socket`. */
export function apolloClient(socket: Client): ApolloClient {
	return new ApolloClient({
		// ultimabaseLive() goes before the WebSocket link.
		link: ApolloLink.from([ultimabaseLive(), new GraphQLWsLink(socket)]),
		cache: new InMemoryCache(),
	})
}
//#endregion

//#region document
type Tasks = {
	readonly tasks: {
		readonly edges: readonly {
			readonly node: { readonly id: string; readonly title: string }
		}[]
		readonly pageInfo: { readonly hasNextPage: boolean }
	}
}

const TasksDocument = gql`
	subscription Tasks($first: Int) {
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
//#endregion

//#region list
export function TaskList() {
	const { data, fetchMore, fetchingMore } = useLiveSubscription<Tasks>(
		TasksDocument,
		{ variables: { first: 2 } },
	)
	if (data === undefined) return <p>Loading…</p>
	return (
		<>
			<ul>
				{data.tasks.edges.map(({ node }) => (
					<li key={node.id}>{node.title}</li>
				))}
			</ul>
			{data.tasks.pageInfo.hasNextPage && (
				<button disabled={fetchingMore} onClick={() => void fetchMore()}>
					More
				</button>
			)}
		</>
	)
}
//#endregion
