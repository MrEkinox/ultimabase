import { serve, type ServerType } from '@hono/node-server'
import {
	HttpApplicationMountTable,
	httpApplicationProtocolVersion,
	httpOriginalHeaderMode,
	type HttpApplication,
	type HttpServerOwnership,
} from '@ultimabase/http-plugin'
import { Hono } from 'hono'
import type { AddressInfo } from 'node:net'

import { readNodeOriginalHeaders } from './original-headers.js'

interface HonoServerProviderOptions {
	readonly app: Hono | undefined
	readonly host: string | undefined
	readonly port: number
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
	readonly #host: string | undefined
	readonly #ownership: HttpServerOwnership
	readonly #port: number
	readonly #startedApplications = new Set<HttpApplication>()
	#dispatcherMounted = false
	#mountTable: HttpApplicationMountTable
	#queue: Promise<void> = Promise.resolve()
	#server: ServerType | undefined

	constructor(options: HonoServerProviderOptions) {
		this.#app = options.app ?? new Hono()
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

	start(application: HttpApplication): Promise<void> {
		return this.#serialize(() => this.#start(application))
	}

	stop(application: HttpApplication): Promise<void> {
		return this.#serialize(() => this.#stop(application))
	}

	dispose(application: HttpApplication): Promise<void> {
		return this.stop(application)
	}

	#mountDispatcher(): void {
		if (this.#dispatcherMounted) return
		this.#app.all('*', (context) =>
			this.#mountTable.fetch({
				originalHeaders: readNodeOriginalHeaders(context.env),
				request: context.req.raw,
			}),
		)
		this.#dispatcherMounted = true
	}

	async #start(application: HttpApplication): Promise<void> {
		if (this.#startedApplications.has(application)) return

		const previousTable = this.#mountTable
		const candidateTable = previousTable.mount(application)
		this.#mountDispatcher()
		this.#mountTable = candidateTable

		try {
			if (this.#ownership === 'framework' && this.#server === undefined) {
				this.#server = await this.#openServer()
			}
			this.#startedApplications.add(application)
		} catch (error: unknown) {
			this.#mountTable = previousTable
			throw error
		}
	}

	async #stop(application: HttpApplication): Promise<void> {
		if (this.#startedApplications.delete(application)) {
			this.#mountTable = this.#mountTable.unmount(application)
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
