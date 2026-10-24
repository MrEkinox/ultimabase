// A plugin's functions over GraphQL (D-113): root fields like the
// application's, named with their plugin, and run with the request's client,
// whose cookies reach the response.
import { httpPlugin } from '@ultimabase/http'
import { afterEach, describe, expect, it } from 'vitest'
import type { Logger, PluginTypes } from 'ultimabase'
import {
	allow,
	defineApp,
	defineFunction,
	definePlugin,
	memory,
} from 'ultimabase'
import { graphqlPlugin } from './index.ts'
import { Post, Secret, User } from './test/app.ts'

const silent: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => silent,
}

const signIn = defineFunction({
	name: 'signIn',
	run: ({ client }) => {
		client?.cookies.set('session', 'token', { httpOnly: true })
	},
}).with({ access: allow.public })
const post = defineFunction({
	name: 'post',
	query: true,
	run: () => undefined,
}).with({ access: allow.public })

/** A plugin, `signing`, whose functions are `functions`. */
const signing = (functions: readonly (typeof signIn | typeof post)[]) =>
	definePlugin<PluginTypes & { readonly name: 'signing' }>({
		name: 'signing',
		manifest: {
			name: 'signing',
			version: '1.0.0',
			peerDependencies: { ultimabase: '*' },
		},
		functions: () => functions,
	}).plugin()

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

async function serving(plugin: ReturnType<typeof signing>) {
	const lines: unknown[] = []
	const logger: Logger = {
		...silent,
		info: (first) => lines.push(first),
		child: () => logger,
	}
	const app = defineApp({
		database: memory(),
		plugins: [httpPlugin({ port: 0 }), graphqlPlugin(), plugin],
		models: [User, Post, Secret],
		logger,
	})
	await app.start()
	stop = async () => app.stop()
	const listening = lines.find(
		(line) => typeof line === 'string' && line.startsWith('Listening on'),
	)
	return String(listening).replace(/^Listening on (.*)\.$/, '$1')
}

describe('a plugin’s function', () => {
	it('sets its cookies on the response', async () => {
		const url = await serving(signing([signIn]))
		const response = await fetch(`${url}/graphql`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query: 'mutation { signIn }' }),
		})
		expect(await response.json()).toStrictEqual({ data: { signIn: true } })
		expect(response.headers.getSetCookie()).toStrictEqual([
			'session=token; Path=/; HttpOnly',
		])
	})

	it('is named with its plugin', async () => {
		await expect(serving(signing([signIn, post]))).rejects.toThrow(
			"signing.post: the root field post is Post's",
		)
	})
})
