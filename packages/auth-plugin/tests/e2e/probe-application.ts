import { UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import type { Pool } from 'pg'

import {
	authPlugin,
	type AuthCookieSameSite,
	type AuthEventHandlers,
	type AuthLinking,
	type AuthSessionOptions,
} from '../../src/index.js'
import { fakeMethod, fakeSignIn } from './fake-method.js'
import {
	probeMethod,
	probeRun,
	type ProbeMethodOptions,
} from './probe-method.js'

/** The origin browsers of the cookie-mode fixtures send. */
export const browserOrigin = 'https://client.example'
/** The session cookie name of the cookie-mode fixtures. */
export const cookieName = '__Host-probe-session'

/** Configures one probe application. */
export interface ProbeApplicationOptions extends Partial<ProbeMethodOptions> {
	/** Serves the session in a cookie to browsers of `browserOrigin`. */
	readonly cookie?: boolean
	/** The cookie's SameSite attribute; the plugin's default otherwise. */
	readonly cookieSameSite?: AuthCookieSameSite
	/** Lets browsers send credentials; cookie mode requires it. @default true */
	readonly credentials?: boolean
	readonly events?: AuthEventHandlers
	readonly linking?: AuthLinking
	readonly session?: AuthSessionOptions
}

/** One HTTP request of a test client. */
export interface ProbeRequest {
	readonly body?: unknown
	readonly headers?: Readonly<Record<string, string>>
	readonly method?: string
	/** Sends this raw body instead of the JSON of `body`. */
	readonly rawBody?: string
}

/**
 * Builds one application with the fake and probe methods, a `ProbeUser`
 * with an optional `nickname`, and the HTTP plugin behind one proxy hop.
 */
export const createProbeApplication = (
	pool: Pool,
	options: ProbeApplicationOptions = {},
) => {
	const {
		cookie = false,
		cookieSameSite,
		credentials = true,
		events,
		linking,
		scenarios = {},
		session,
	} = options
	const App = UltimaBase.use(
		postgresPlugin({ pool, schemaPolicy: 'override' }),
		authPlugin({
			methods: [fakeMethod(), probeMethod({ ...options, scenarios })],
			...(events === undefined ? {} : { events }),
			...(linking === undefined ? {} : { linking }),
			...(session === undefined ? {} : { session }),
			...(cookie
				? {
						http: {
							cookie: {
								name: cookieName,
								...(cookieSameSite === undefined
									? {}
									: { sameSite: cookieSameSite }),
							},
						},
					}
				: {}),
		}),
		httpPlugin({
			// `fetch()` has no socket: one proxy hop makes X-Forwarded-For the client.
			trustProxy: 1,
			...(cookie ? { browser: { credentials, origins: [browserOrigin] } } : {}),
		}),
	)
	const ProbeUser = App.UserSchema.define({
		className: 'ProbeUser',
		fields: (field) => ({ nickname: field.string() }),
	})
	const ultimabase = new App({ logger: false, schemas: [ProbeUser] })
	const auth = () => ultimabase.plugin(authPlugin)
	/** Signs in one fake account, creating its user the first time. */
	const signIn = (providerUserId: string, email: string | null = null) =>
		ultimabase
			.operation(fakeSignIn)
			.execute({ email, emailVerified: email !== null, providerUserId })
	/** Runs one probe scenario without a session. */
	const run = (scenario: string, input?: unknown) =>
		ultimabase.operation(probeRun).execute({ input, scenario })
	/** Runs application code as the session of `token`. */
	const asUser = <TResult>(token: string, work: () => Promise<TResult>) =>
		auth().runWithSession(token, work)
	/** Sends one request to an authentication route. */
	const send = (path: string, request: ProbeRequest = {}) => {
		const body =
			request.rawBody ??
			(request.body === undefined ? undefined : JSON.stringify(request.body))
		return ultimabase.plugin(httpPlugin).fetch(
			new Request(`https://api.example.test/api/auth/${path}`, {
				...(body === undefined ? {} : { body }),
				headers: {
					'Content-Type': 'application/json',
					'X-Forwarded-For': '198.51.100.7',
					...request.headers,
				},
				method: request.method ?? 'POST',
			}),
		)
	}
	return { App, ProbeUser, asUser, auth, run, send, signIn, ultimabase }
}

/** Reads one JSON response as unknown data, with its status. */
export const readResponse = async (
	response: Response,
): Promise<Readonly<{ body: unknown; status: number }>> => {
	const body: unknown = await response.json()
	return { body, status: response.status }
}
