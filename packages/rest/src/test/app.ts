// The application the REST tests serve: users, their posts, a model whose
// read rule breaks, and a hidden model reached through posts.
import type { Routes } from '@ultimabase/http'
import { httpPlugin } from '@ultimabase/http'
import type { Adapter, Logger } from 'ultimabase'
import { allow, defineApp, defineModel, master, memory } from 'ultimabase'
import { rest, restPlugin } from '../index.ts'
import type { RestOptions } from '../index.ts'

export const User = defineModel({
	name: 'User',
	use: [rest()],
	fields: (f) => ({
		name: f.string({ unique: true }),
		email: f.string().with({ access: { read: () => false } }),
		password: f.string({ optional: true }).with({
			access: { read: allow.private },
		}),
		posts: f.many(() => Post),
	}),
}).with({ access: allow.readOnly, rest: { maxTake: 3 } })

export const Post = defineModel({
	name: 'Post',
	use: [rest()],
	fields: (f) => ({
		title: f.string(),
		slug: f.string(),
		status: f.enumOf(['draft', 'published']),
		views: f.number({ default: 0 }),
		meta: f.json({ optional: true }),
		publishedAt: f.dateTime({ optional: true }),
		author: f.one(() => User),
		tags: f.many(() => Tag),
	}),
	indexes: [{ fields: ['author', 'slug'], unique: true }],
}).with({ access: allow.readOnly })

/** Hidden: read and connected through posts, never routed (D-129). */
export const Tag = defineModel({
	name: 'Tag',
	use: [rest()],
	fields: (f) => ({
		label: f.string(),
		post: f.one(() => Post, { optional: true }),
	}),
}).with({ access: allow.readOnly, rest: false })

export const Secret = defineModel({
	name: 'Secret',
	use: [rest()],
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

type Definition = Parameters<typeof defineApp>[0]
type Functions = Definition['functions']
type Models = Definition['models']

export async function started(
	options: RestOptions = {},
	database: Adapter = memory(),
	functions: Functions = [],
	models: Models = [User, Post, Tag, Secret],
	served: readonly Routes[] = [],
) {
	const lines: Line[] = []
	const app = defineApp({
		database,
		plugins: [httpPlugin({ port: 0, routes: served }), restPlugin(options)],
		models,
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

/** Server code's options: as Master. */
export const M = { as: master }
export const asMaster = { 'x-ultimabase-master-key': 'secret' }

/** Two users, four posts, a tag and a secret; returns the users' ids. */
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

/** A query string: each string as is, any other value as JSON (D-129). */
export const qs = (params: { readonly [name: string]: unknown }): string =>
	`?${new URLSearchParams(
		Object.entries(params).map(([name, value]): [string, string] => [
			name,
			typeof value === 'string' ? value : JSON.stringify(value),
		]),
	).toString()}`

export type Sent = { readonly status: number; readonly body: unknown }

/** Calls the running application: a body is sent as JSON. */
export async function call(
	url: string,
	method: string,
	path: string,
	options: {
		readonly body?: unknown
		readonly headers?: { readonly [name: string]: string }
	} = {},
): Promise<Sent> {
	const response = await fetch(`${url}${path}`, {
		method,
		headers: {
			...(options.body === undefined
				? {}
				: { 'content-type': 'application/json' }),
			...options.headers,
		},
		...(options.body === undefined
			? {}
			: { body: JSON.stringify(options.body) }),
	})
	const text = await response.text()
	const body: unknown = text === '' ? undefined : JSON.parse(text)
	return { status: response.status, body }
}

/** The value at a path of a body, or `undefined`. */
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
