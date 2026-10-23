// auth's application for tests (D-112): a user model, a sign-in method's
// stand-in, and the requests a client sends.
import type { Http } from '@ultimabase/http'
import { httpPlugin, routes } from '@ultimabase/http'
import type { Adapter, Logger, PluginTypes } from 'ultimabase'
import { defineApp, definePlugin, master, memory } from 'ultimabase'
import type { Auth } from '../index.ts'
import { authPlugin, defineUser } from '../index.ts'

export const M = { as: master }
export const day = 24 * 60 * 60 * 1000

export const User = defineUser({
	name: 'User',
	fields: (f) => ({ email: f.string({ unique: true }) }),
})

const manifest = {
	name: 'signing',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}
interface Signing extends PluginTypes {
	readonly name: 'signing'
	readonly requires: Http | Auth
}
// A sign-in method's stand-in: it trusts the id it is sent.
const signing = definePlugin<Signing>({
	name: 'signing',
	manifest,
	requires: { http: httpPlugin, auth: authPlugin },
	api: ({ plugins }) => {
		plugins.http.mount(
			routes()
				.get('/caller', (c) => c.json(c.var.caller))
				.post('/sign-in', async (c) => {
					const { id } = await c.req.json<{ id: string }>()
					const opened = await plugins.auth.signIn(c, id)
					return c.json({ token: opened.token })
				})
				.post('/revoke', async (c) => {
					const { id } = await c.req.json<{ id: string }>()
					await plugins.auth.revokeSessions(id)
					return c.body(null, 204)
				}),
		)
	},
})

export function listening(lines: string[]): Logger {
	const logger: Logger = {
		info: (first) => {
			if (typeof first === 'string') lines.push(first)
		},
		warn: () => undefined,
		error: () => undefined,
		child: () => logger,
	}
	return logger
}

/** A started application on a free port, with a signed-up user. */
export async function started(database: Adapter = memory()) {
	const lines: string[] = []
	const app = defineApp({
		database,
		plugins: [httpPlugin({ port: 0 }), authPlugin(), signing.plugin()],
		models: [User],
		logger: listening(lines),
	})
	await app.start()
	const line = lines.find((first) => first.startsWith('Listening on')) ?? ''
	const url = line.replace(/^Listening on (.*)\.$/, '$1')
	const ada = await User.create({ data: { email: 'ada@example.com' } }, M)
	return { app, url, ada }
}

/** Signs `id` in: its token, and the cookie the response sets. */
export async function signIn(url: string, id: string) {
	const response = await fetch(`${url}/sign-in`, {
		method: 'POST',
		body: JSON.stringify({ id }),
	})
	const body: unknown = await response.json()
	const token = String(Reflect.get(Object(body), 'token'))
	return { token, setCookie: response.headers.get('set-cookie') }
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
export const cookie = (token: string) => ({
	cookie: `ultimabase_session=${token}`,
})

export async function callerOf(url: string, headers: Record<string, string>) {
	const response = await fetch(`${url}/caller`, { headers })
	const body: unknown = await response.json()
	return { status: response.status, body }
}
