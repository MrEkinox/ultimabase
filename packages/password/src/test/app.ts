// password's application for tests (D-113): a user model that signs up with
// a name, a birth date, tags and typed preferences, and the GraphQL requests a client sends.
import { authPlugin, defineUser, signedIn } from '@ultimabase/auth'
import { graphql, graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { realtimePlugin } from '@ultimabase/realtime'
import type { Adapter, Logger } from 'ultimabase'
import { allow, defineApp, master, memory } from 'ultimabase'
import type { Email, PasswordOptions } from '../index.ts'
import { expect } from 'vitest'
import { z } from 'zod'
import { password, passwordPlugin } from '../index.ts'

/** The `user` of an email `sendEmail` received: the row of the user `id`. */
export const rowOf = (id: string | undefined): unknown =>
	expect.objectContaining({ id })

export const M = { as: master }

// Each user reads and updates their own row, but never reads its note.
export const User = defineUser({
	name: 'User',
	use: [graphql(), password()],
	fields: (f) => ({
		name: f.string(),
		born: f.dateTime({ optional: true }),
		age: f.number({ integer: true, optional: true }),
		tags: f.string({ list: true }),
		prefs: f.json({
			optional: true,
			validate: z.object({
				theme: z.enum(['light', 'dark']),
				nick: z.string().min(2).optional(),
			}),
		}),
		note: f.string({ optional: true }).with({
			access: { read: allow.private },
		}),
	}),
}).with({
	access: {
		read: signedIn(({ user, where }) => where({ id: user.id })),
		create: allow.public,
		update: ({ caller, record }) =>
			caller.kind === 'user' && caller.user.id === record.id,
	},
})

/**
 * The application's logger: `named` gets each info line with its logger's
 * bindings, as `{ name: 'app', kind: 'reset', msg: 'Email sent.' }`.
 */
function listening(
	lines: string[],
	errors: string[],
	warnings: string[],
	named: object[],
	bindings: object = {},
): Logger {
	return {
		info: (first: object | string, message?: string) => {
			if (typeof first === 'string') lines.push(first)
			const facts = typeof first === 'string' ? {} : first
			const msg = typeof first === 'string' ? first : message
			named.push({ ...bindings, ...facts, msg })
		},
		warn: (first: object | string, message?: string) => {
			warnings.push(typeof first === 'string' ? first : String(message))
		},
		error: (first: object | string, message?: string) => {
			errors.push(typeof first === 'string' ? first : String(message))
		},
		child: (more) =>
			listening(lines, errors, warnings, named, { ...bindings, ...more }),
	}
}

/** A started application on a free port. */
export async function started(
	options: PasswordOptions = { signUp: ['name', 'born', 'tags'] },
	database: Adapter = memory(),
	sockets = false,
) {
	const lines: string[] = []
	const errors: string[] = []
	const warnings: string[] = []
	const named: object[] = []
	const app = defineApp({
		database,
		plugins: [
			httpPlugin({ port: 0 }),
			...(sockets ? [realtimePlugin()] : []),
			graphqlPlugin(),
			authPlugin(),
			passwordPlugin(options),
		],
		models: [User],
		logger: listening(lines, errors, warnings, named),
	})
	await app.start()
	const line = lines.find((first) => first.startsWith('Listening on')) ?? ''
	const url = line.replace(/^Listening on (.*)\.$/, '$1')
	return { app, url, errors, warnings, named }
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

/** A GraphQL request's status, body and the cookies its response sets. */
export async function graphqlOf(
	url: string,
	query: string,
	variables: Record<string, unknown> = {},
	headers: Record<string, string> = {},
) {
	const response = await fetch(`${url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ query, variables }),
	})
	const body: unknown = await response.json()
	return {
		status: response.status,
		body,
		setCookie: response.headers.getSetCookie(),
	}
}

const fields = 'token expiresAt user { id name }'
export const signUpQuery = `mutation ($input: SignUpInput!) { signUp(input: $input) { ${fields} } }`
export const signInQuery = `mutation ($input: SignInInput!) { signIn(input: $input) { ${fields} } }`
export const changeQuery = `mutation ($input: ChangePasswordInput!) { changePassword(input: $input) { ${fields} } }`

/** The token of a GraphQL `SignedIn`, under `field`. */
export function tokenOf(body: unknown, field: string): string {
	const data: unknown = Reflect.get(Object(body), 'data')
	const signed: unknown = Reflect.get(Object(data), field)
	return String(Reflect.get(Object(signed), 'token'))
}

/** The token an email's link carries, `''` for one without. */
export const tokenIn = (email: Email | undefined): string =>
	email !== undefined && 'token' in email ? email.token : ''

/** One GraphQL operation's result over a WebSocket, as `authorization`. */
export async function socketOf(
	url: string,
	query: string,
	variables: Record<string, unknown>,
	authorization?: string,
): Promise<unknown> {
	const at = `${url.replace(/^http/, 'ws')}/graphql`
	const ws = new WebSocket(at, 'graphql-transport-ws')
	const send = (message: object) => ws.send(JSON.stringify(message))
	try {
		return await new Promise((resolve, reject) => {
			ws.addEventListener('error', reject)
			ws.addEventListener('open', () => {
				const payload = authorization === undefined ? {} : { authorization }
				send({ type: 'connection_init', payload })
			})
			ws.addEventListener('message', ({ data }) => {
				const message: unknown = JSON.parse(String(data))
				const type: unknown = Reflect.get(Object(message), 'type')
				if (type === 'connection_ack') {
					send({ id: '1', type: 'subscribe', payload: { query, variables } })
				} else if (type === 'next') {
					resolve(Reflect.get(Object(message), 'payload'))
				} else reject(new Error(String(data)))
			})
		})
	} finally {
		ws.close()
	}
}
