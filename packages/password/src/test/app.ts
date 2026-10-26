// password's application for tests (D-113): a user model that signs up with
// a name, a birth date, tags and typed preferences, and the GraphQL requests a client sends.
import { authPlugin, defineUser, signedIn } from '@ultimabase/auth'
import { graphql, graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import type { Adapter, Logger } from 'ultimabase'
import { allow, defineApp, master, memory } from 'ultimabase'
import type { PasswordOptions } from '../index.ts'
import { z } from 'zod'
import { password, passwordPlugin } from '../index.ts'

export const M = { as: master }

// Each user reads and updates their own row, but never reads its note.
export const User = defineUser({
	name: 'User',
	use: [graphql(), password()],
	fields: (f) => ({
		name: f.string(),
		born: f.date({ optional: true }),
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

function listening(lines: string[], errors: string[]): Logger {
	const logger: Logger = {
		info: (first) => {
			if (typeof first === 'string') lines.push(first)
		},
		warn: () => undefined,
		error: (first, message?: string) => {
			errors.push(typeof first === 'string' ? first : String(message))
		},
		child: () => logger,
	}
	return logger
}

/** A started application on a free port. */
export async function started(
	options: PasswordOptions = { signUp: ['name', 'born', 'tags'] },
	database: Adapter = memory(),
) {
	const lines: string[] = []
	const errors: string[] = []
	const app = defineApp({
		database,
		plugins: [
			httpPlugin({ port: 0 }),
			graphqlPlugin(),
			authPlugin(),
			passwordPlugin(options),
		],
		models: [User],
		logger: listening(lines, errors),
	})
	await app.start()
	const line = lines.find((first) => first.startsWith('Listening on')) ?? ''
	const url = line.replace(/^Listening on (.*)\.$/, '$1')
	return { app, url, errors }
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
