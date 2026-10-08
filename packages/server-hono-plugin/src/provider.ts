import { serve, type ServerType } from '@hono/node-server'
import {
	dispatchHttpApplicationRequest,
	dispatchHttpBrowserRequest,
	type HttpApplication,
	type HttpBrowserPolicy,
	type HttpServerOwnership,
} from '@ultimabase/http-plugin'
import { Hono } from 'hono'
import type { AddressInfo } from 'node:net'

import { readNodeOriginalHeaders } from './original-headers.js'

interface HonoServerProviderOptions {
	readonly app: Hono | undefined
	readonly browserPolicyOwner?: 'external' | 'ultimabase'
	readonly host: string | undefined
	readonly port: number
}

const disabledBrowserPolicy: HttpBrowserPolicy = Object.freeze({
	enabled: false,
})

const assertBrowserPolicyAuthorityCompatibility = (
	application: HttpApplication,
	policy: HttpBrowserPolicy,
): void => {
	if (
		policy.enabled &&
		policy.allowedOrigins === '*' &&
		application.authority.master.enabled
	) {
		throw new TypeError(
			'HTTP browser policy wildcard origins cannot be combined with Master transport',
		)
	}
}

const closeServer = (server: ServerType): Promise<void> => {
	if (!server.listening) return Promise.resolve()
	return new Promise((resolve, reject) => {
		server.close((error?: Error) => {
			if (error === undefined) resolve()
			else reject(error)
		})
	})
}

const normalizeServerError = (error: unknown): Error =>
	error instanceof Error
		? error
		: new Error('Hono listener failed with a non-Error reason.', {
				cause: error,
			})

/** Owns one listener and one HTTP application at a time, with sequential reuse. */
export class HonoServerProvider {
	readonly #app: Hono
	readonly #browserPolicyOwner: 'external' | 'ultimabase'
	readonly #host: string | undefined
	readonly #ownership: HttpServerOwnership
	readonly #port: number
	#application: HttpApplication | undefined
	#acceptingRequests = false
	#dispatcherMounted = false
	#browserPolicy: HttpBrowserPolicy | undefined
	#queue: Promise<void> = Promise.resolve()
	#server: ServerType | undefined

	constructor(options: HonoServerProviderOptions) {
		this.#app = options.app ?? new Hono()
		this.#browserPolicyOwner = options.browserPolicyOwner ?? 'ultimabase'
		this.#host = options.host
		this.#ownership = options.app === undefined ? 'framework' : 'external'
		this.#port = options.port
	}

	/** Reports the active framework-owned listener address, if any. */
	get address(): AddressInfo | undefined {
		const address = this.#server?.address()
		return typeof address === 'object' && address !== null ? address : undefined
	}

	start(
		application: HttpApplication,
		browserPolicy: HttpBrowserPolicy = disabledBrowserPolicy,
	): Promise<void> {
		return this.#serialize(() => this.#start(application, browserPolicy))
	}

	stop(application: HttpApplication): Promise<void> {
		return this.#serialize(() => this.#stop(application))
	}

	#mountDispatcher(): void {
		if (this.#dispatcherMounted) return
		this.#app.all('*', (context) => {
			const input = {
				originalHeaders: readNodeOriginalHeaders(context.env),
				request: context.req.raw,
			}
			const application = this.#acceptingRequests
				? this.#application
				: undefined
			const dispatch = () => dispatchHttpApplicationRequest(application, input)
			return this.#browserPolicyOwner === 'external'
				? dispatch()
				: dispatchHttpBrowserRequest(
						this.#browserPolicy ?? disabledBrowserPolicy,
						input,
						dispatch,
					)
		})
		this.#dispatcherMounted = true
	}

	async #start(
		application: HttpApplication,
		browserPolicy: HttpBrowserPolicy,
	): Promise<void> {
		if (this.#application === application && this.#acceptingRequests) return
		if (this.#application !== undefined) {
			throw new TypeError(
				'Hono server already owns an application; complete its disposal before replacement',
			)
		}
		assertBrowserPolicyAuthorityCompatibility(application, browserPolicy)
		if (this.#browserPolicyOwner === 'external' && browserPolicy.enabled) {
			throw new TypeError(
				'Externally owned browser policy requires HTTP browser policy to be disabled',
			)
		}
		this.#mountDispatcher()
		this.#application = application
		this.#browserPolicy = browserPolicy
		this.#acceptingRequests = true

		try {
			if (this.#ownership === 'framework') {
				this.#server = await this.#openServer()
			}
		} catch (error: unknown) {
			// A failed startup cleanup still owns its listener until disposal proves release.
			if (this.#server === undefined) this.#application = undefined
			this.#browserPolicy = undefined
			this.#acceptingRequests = false
			throw error
		}
	}

	async #stop(application: HttpApplication): Promise<void> {
		if (this.#application !== application) return
		// Reject new requests before draining the listener; retain ownership if cleanup fails.
		this.#acceptingRequests = false
		this.#browserPolicy = undefined
		if (this.#ownership === 'framework' && this.#server !== undefined) {
			await closeServer(this.#server)
			this.#server = undefined
		}
		this.#application = undefined
	}

	#openServer(): Promise<ServerType> {
		return new Promise((resolve, reject) => {
			let server: ServerType
			let settled = false
			const fail = (error: unknown): void => {
				if (settled) return
				settled = true
				server.removeListener('error', fail)
				void closeServer(server).then(
					() => {
						reject(normalizeServerError(error))
					},
					(cleanupError: unknown) => {
						this.#server = server
						reject(
							new AggregateError(
								[error, cleanupError],
								'Hono listener startup and cleanup both failed.',
								{ cause: error },
							),
						)
					},
				)
			}
			try {
				server = serve(
					{
						fetch: this.#app.fetch,
						...(this.#host === undefined ? {} : { hostname: this.#host }),
						overrideGlobalObjects: false,
						port: this.#port,
					},
					() => {
						if (settled) return
						settled = true
						server.removeListener('error', fail)
						resolve(server)
					},
				)
				server.once('error', fail)
			} catch (error: unknown) {
				reject(normalizeServerError(error))
			}
		})
	}

	#serialize(operation: () => Promise<void>): Promise<void> {
		// The queue absorbs earlier failures; callers still receive their own result.
		const result = this.#queue.then(operation)
		this.#queue = result.catch(() => undefined)
		return result
	}
}
