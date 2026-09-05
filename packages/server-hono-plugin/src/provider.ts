import { serve, type ServerType } from '@hono/node-server'
import {
	HttpApplicationMountTable,
	dispatchHttpBrowserRequest,
	httpApplicationProtocolVersion,
	httpOriginalHeaderMode,
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

const browserPoliciesEqual = (
	left: HttpBrowserPolicy,
	right: HttpBrowserPolicy,
): boolean => {
	if (!left.enabled || !right.enabled) return left.enabled === right.enabled
	return (
		left.credentials === right.credentials &&
		left.maxAgeSeconds === right.maxAgeSeconds &&
		(left.allowedOrigins === '*' || right.allowedOrigins === '*'
			? left.allowedOrigins === right.allowedOrigins
			: left.allowedOrigins.length === right.allowedOrigins.length &&
				left.allowedOrigins.every(
					(origin, index) => origin === right.allowedOrigins[index],
				)) &&
		left.allowedMethods.length === right.allowedMethods.length &&
		left.allowedMethods.every(
			(method, index) => method === right.allowedMethods[index],
		) &&
		left.allowedHeaders.length === right.allowedHeaders.length &&
		left.allowedHeaders.every(
			(header, index) => header === right.allowedHeaders[index],
		)
	)
}

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

/** Owns one explicit provider shared only by applications reusing its plugin value. */
export class HonoServerProvider {
	readonly #app: Hono
	readonly #browserPolicyOwner: 'external' | 'ultimabase'
	readonly #host: string | undefined
	readonly #ownership: HttpServerOwnership
	readonly #port: number
	readonly #startedApplications = new Set<HttpApplication>()
	#dispatcherMounted = false
	#browserPolicy: HttpBrowserPolicy | undefined
	#mountTable: HttpApplicationMountTable
	#queue: Promise<void> = Promise.resolve()
	#server: ServerType | undefined

	constructor(options: HonoServerProviderOptions) {
		this.#app = options.app ?? new Hono()
		this.#browserPolicyOwner = options.browserPolicyOwner ?? 'ultimabase'
		this.#host = options.host
		this.#ownership = options.app === undefined ? 'framework' : 'external'
		this.#port = options.port
		this.#mountTable = new HttpApplicationMountTable({
			applicationProtocolVersion: httpApplicationProtocolVersion,
			originalHeaderMode: httpOriginalHeaderMode,
			ownership: this.#ownership,
		})
	}

	/** @internal Reports the active listener address for focused provider tests. */
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

	dispose(application: HttpApplication): Promise<void> {
		return this.stop(application)
	}

	#mountDispatcher(): void {
		if (this.#dispatcherMounted) return
		this.#app.all('*', (context) => {
			const input = {
				originalHeaders: readNodeOriginalHeaders(context.env),
				request: context.req.raw,
			}
			const dispatch = () => this.#mountTable.fetch(input)
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
		if (this.#startedApplications.has(application)) return
		assertBrowserPolicyAuthorityCompatibility(application, browserPolicy)
		if (this.#browserPolicyOwner === 'external' && browserPolicy.enabled) {
			throw new TypeError(
				'Externally owned browser policy requires HTTP browser policy to be disabled',
			)
		}
		if (
			this.#browserPolicy !== undefined &&
			!browserPoliciesEqual(this.#browserPolicy, browserPolicy)
		) {
			throw new TypeError(
				'Applications sharing one Hono server must use an identical HTTP browser policy',
			)
		}

		const previousTable = this.#mountTable
		const previousBrowserPolicy = this.#browserPolicy
		const candidateTable = previousTable.mount(application)
		this.#mountDispatcher()
		this.#mountTable = candidateTable
		this.#browserPolicy = browserPolicy

		try {
			if (this.#ownership === 'framework' && this.#server === undefined) {
				this.#server = await this.#openServer()
			}
			this.#startedApplications.add(application)
		} catch (error: unknown) {
			this.#mountTable = previousTable
			this.#browserPolicy = previousBrowserPolicy
			throw error
		}
	}

	async #stop(application: HttpApplication): Promise<void> {
		if (this.#startedApplications.delete(application)) {
			this.#mountTable = this.#mountTable.unmount(application)
			if (this.#mountTable.size === 0) this.#browserPolicy = undefined
		}

		if (
			this.#ownership === 'framework' &&
			this.#mountTable.size === 0 &&
			this.#server !== undefined
		) {
			const server = this.#server
			await closeServer(server)
			if (this.#server === server) this.#server = undefined
		}
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
		const result = this.#queue.then(operation, operation)
		this.#queue = result.catch(() => undefined)
		return result
	}
}
