// What the HTTP benchmark's clients send.
import type { Sent } from './load.ts'

const json = { 'content-type': 'application/json' }

export type Case = {
	readonly name: string
	readonly sent: readonly Sent[]
}

const graphqlRequest = (
	document: string,
	headers: Readonly<Record<string, string>>,
): Sent => ({
	method: 'POST',
	path: '/graphql',
	headers: { ...json, ...headers },
	body: JSON.stringify({ query: document }),
})

const listSelect = encodeURIComponent(
	JSON.stringify({
		title: true,
		likes: true,
		author: { select: { name: true } },
		comments: { first: 3, select: { text: true } },
	}),
)
const listOrder = encodeURIComponent(JSON.stringify({ likes: 'asc' }))

/** The cases, on `ids`, posts of the user `token` signs in. */
export function casesOf(ids: readonly string[], token: string): Case[] {
	const bearer = { authorization: `Bearer ${token}` }
	const each = (build: (id: string) => Sent): readonly Sent[] => ids.map(build)
	return [
		{
			name: 'REST, read by id, a visitor',
			sent: each((id) => ({
				method: 'GET',
				path: `/api/posts/${id}`,
				headers: {},
			})),
		},
		{
			name: 'REST, read by id, signed in',
			sent: each((id) => ({
				method: 'GET',
				path: `/api/posts/${id}`,
				headers: bearer,
			})),
		},
		{
			name: 'REST, a list of 25, nested, signed in',
			sent: [
				{
					method: 'GET',
					path: `/api/posts?first=25&orderBy=${listOrder}&select=${listSelect}`,
					headers: bearer,
				},
			],
		},
		{
			name: 'REST, create, signed in',
			sent: [
				{
					method: 'POST',
					path: '/api/posts',
					headers: { ...json, ...bearer },
					body: JSON.stringify({ title: 'new' }),
				},
			],
		},
		{
			name: 'REST, update, signed in',
			sent: each((id) => ({
				method: 'PATCH',
				path: `/api/posts/${id}`,
				headers: { ...json, ...bearer },
				body: JSON.stringify({ likes: 3 }),
			})),
		},
		{
			name: 'GraphQL, read by id, signed in',
			sent: each((id) =>
				graphqlRequest(
					`query { post(where: { id: "${id}" }) { id title likes published } }`,
					bearer,
				),
			),
		},
		{
			name: 'GraphQL, a list of 25, nested, signed in',
			sent: [
				graphqlRequest(
					`query { posts(first: 25, orderBy: [{ likes: asc }]) { edges { node { title likes author { name } comments(first: 3) { edges { node { text } } } } } } }`,
					bearer,
				),
			],
		},
		{
			name: 'GraphQL, create, signed in',
			sent: [
				graphqlRequest(
					`mutation { createPost(data: { title: "new" }) { id title } }`,
					bearer,
				),
			],
		},
		{
			name: 'GraphQL, update, signed in',
			sent: each((id) =>
				graphqlRequest(
					`mutation { updatePost(where: { id: "${id}" }, data: { likes: 3 }) { id likes } }`,
					bearer,
				),
			),
		},
	]
}
