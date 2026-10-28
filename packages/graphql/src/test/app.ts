// The application the GraphQL tests serve: users, their posts, and a model
// whose read rule breaks.
import type { Routes } from '@ultimabase/http'
import { httpPlugin } from '@ultimabase/http'
import type { Adapter, Logger } from 'ultimabase'
import { allow, defineApp, defineModel, master, memory } from 'ultimabase'
import { graphql, graphqlPlugin } from '../index.ts'
import type { GraphqlOptions } from '../index.ts'

export const User = defineModel({
	name: 'User',
	use: [graphql()],
	fields: (f) => ({
		name: f.string({ unique: true }),
		email: f.string().with({ access: { read: () => false } }),
		password: f.string({ optional: true }).with({
			access: { read: allow.private },
		}),
		posts: f.many(() => Post),
	}),
}).with({ access: allow.readOnly, graphql: { maxTake: 3 } })

export const Post = defineModel({
	name: 'Post',
	use: [graphql()],
	fields: (f) => ({
		title: f.string({ search: true }),
		slug: f.string(),
		status: f.enumOf(['draft', 'published']),
		views: f.number({ default: 0 }),
		meta: f.json({ optional: true }),
		publishedAt: f.date({ optional: true }),
		author: f.one(() => User),
	}),
	indexes: [{ fields: ['author', 'slug'], unique: true }],
}).with({ access: allow.readOnly })

export const Secret = defineModel({
	name: 'Secret',
	use: [graphql()],
	fields: (f) => ({ text: f.string() }),
}).with({
	access: {
		read: () => {
			throw new Error('The rule broke.')
		},
	},
})

type Line = { readonly level: string; readonly first: unknown }
function recorder(lines: Line[]): Logger {
	const log = (level: string) => (first: string | object) => {
		lines.push({ level, first })
	}
	const logger: Logger = {
		info: log('info'),
		warn: log('warn'),
		error: log('error'),
		child: () => logger,
	}
	return logger
}

type Functions = Parameters<typeof defineApp>[0]['functions']

export async function started(
	options: GraphqlOptions = {},
	database: Adapter = memory(),
	served: readonly Routes[] = [],
	functions: Functions = [],
) {
	const lines: Line[] = []
	const app = defineApp({
		database,
		plugins: [httpPlugin({ port: 0, routes: served }), graphqlPlugin(options)],
		models: [User, Post, Secret],
		functions,
		masterKey: 'secret',
		logger: recorder(lines),
	})
	await app.start()
	const listening = lines.find(
		(line) =>
			typeof line.first === 'string' && line.first.startsWith('Listening on'),
	)
	const url = String(listening?.first).replace(/^Listening on (.*)\.$/, '$1')
	return { app, lines, url }
}

export type Result = {
	readonly data?: unknown
	readonly errors?: readonly {
		readonly message: string
		readonly extensions?: unknown
	}[]
}

/** Server code's options: as Master. */
export const M = { as: master }
export const asMaster = { 'x-ultimabase-master-key': 'secret' }

/** Two users, four posts and a secret; returns the users' ids. */
export async function seeded(): Promise<{ ada: string; bob: string }> {
	const a = await User.create(
		{ data: { name: 'ada', email: 'ada@example.com', password: 'x' } },
		M,
	)
	const b = await User.create(
		{ data: { name: 'bob', email: 'b@example.com' } },
		M,
	)
	for (const [index, title] of ['one', 'two', 'three', 'four'].entries()) {
		await Post.create(
			{
				data: {
					title,
					slug: title,
					status: index % 2 === 0 ? 'published' : 'draft',
					views: index * 10,
					meta: { index },
					publishedAt: new Date(Date.UTC(2026, 0, index + 1)),
					author: { connect: { id: index < 3 ? a.id : b.id } },
				},
			},
			M,
		)
	}
	await Secret.create({ data: { text: 'hidden' } }, M)
	return { ada: a.id, bob: b.id }
}

/** Posts a document to the running application. */
export async function post(
	url: string,
	query: string,
	variables?: object,
	headers: Record<string, string> = {},
): Promise<Result> {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ query, variables }),
	})
	const result: unknown = await response.json()
	if (!isResult(result)) throw new Error('The response is not a result.')
	return result
}

// What graphql-http sends is a GraphQL result; the assertions read it.
const isResult = (value: unknown): value is Result =>
	typeof value === 'object' && value !== null

/** The value at a path of a result, or `undefined`. */
export function at(
	value: unknown,
	...path: readonly (string | number)[]
): unknown {
	let current = value
	for (const key of path) {
		if (typeof current !== 'object' || current === null) return undefined
		current = Reflect.get(current, key)
	}
	return current
}
