// push's application for tests: a user model, auth, and a stand-in that
// reads callers from tokens as a request does.
import type { Auth, AuthApi } from '@ultimabase/auth'
import { authPlugin, defineUser } from '@ultimabase/auth'
import { httpPlugin } from '@ultimabase/http'
import type { Caller, Logger, PluginTypes } from 'ultimabase'
import { defineApp, definePlugin, master, memory } from 'ultimabase'
import { newKeys } from '../keys.ts'
import type { PushOptions } from '../options.ts'
import { pushPlugin } from '../plugin.ts'

export const M = { as: master }

export const User = defineUser({
	name: 'User',
	fields: (f) => ({ email: f.string({ unique: true }) }),
})

interface Signing extends PluginTypes {
	readonly name: 'signing'
	readonly requires: Auth
}
const given: {
	auth?: AuthApi
	identify?: (request: Request) => Promise<Caller>
} = {}
const signing = definePlugin<Signing>({
	name: 'signing',
	manifest: {
		name: 'signing',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { auth: authPlugin },
	api: ({ plugins, identify }) => {
		given.auth = plugins.auth
		given.identify = identify
	},
})

/** What the application logged at warn level: strings, and objects. */
export function listening(warnings: unknown[]): Logger {
	const logger: Logger = {
		info: () => undefined,
		warn: (first: string | object, message?: string) => {
			warnings.push(message === undefined ? first : [first, message])
		},
		error: () => undefined,
		child: () => logger,
	}
	return logger
}

export const keys = newKeys()
export const web = { ...keys, subject: 'mailto:ops@example.com' }

/** A started application with push's `options`, and a user. */
export async function started(options?: PushOptions) {
	const warnings: unknown[] = []
	const app = defineApp({
		database: memory(),
		plugins: [
			httpPlugin({ port: 0, drain: 0 }),
			authPlugin(),
			signing.plugin(),
			pushPlugin(options),
		],
		models: [User],
		logger: listening(warnings),
	})
	await app.start()
	const ada = await User.create({ data: { email: 'ada@example.com' } }, M)
	return { app, ada, warnings }
}

/** A user's caller from a new session, as a request reads it. */
export async function signedIn(userId: string): Promise<Caller> {
	const { auth, identify } = given
	if (auth === undefined || identify === undefined) {
		throw new Error('The application is not started.')
	}
	const { token } = await auth.signIn(userId)
	return identify(
		new Request('http://localhost/', {
			headers: { authorization: `Bearer ${token}` },
		}),
	)
}

/** Ends every session of a user. */
export async function revoked(userId: string): Promise<void> {
	await given.auth?.revokeSessions(userId)
}
