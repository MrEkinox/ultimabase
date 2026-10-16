import { randomUUID } from 'node:crypto'
import process from 'node:process'

import {
	runWithRequestEngine,
	type Principal,
	type SchemaDefinition,
	type UltimaBase,
} from '@ultimabase/core'
import {
	RequestContext,
	openApplicationHarness,
	waitForAfterCommitWork,
	withContext,
	type ApplicationHarness,
	type PluginDefinition,
	type PluginSourceState,
} from '@ultimabase/core/plugin'

import { openTestDatabase, type TestDatabase } from './test-database.js'

/** Options of one `t.fetch` request. */
export interface TestFetchOptions {
	/**
	 * The socket peer the request comes from; `t.fetch` behaves like a local
	 * server, so it is `'127.0.0.1'` when omitted. `undefined` sends no peer,
	 * as a fetch handler without one: the client address is then unknown
	 * unless a trusted `X-Forwarded-For` names it (ADR-0334).
	 *
	 * @example `await t.fetch('/status', undefined, { remoteAddress: undefined })`
	 */
	readonly remoteAddress?: string | undefined
}

/**
 * One test's handle on an application started by `testApplication` (ADR-0327).
 * Leaving its `await using` scope waits for after-commit work; the
 * application keeps running for the next `testApplication` call on it.
 */
export interface TestApplication extends AsyncDisposable {
	/**
	 * Empties every table of the application, keeping the tables, then reruns
	 * the plugins' start seeding: Roles `ensure` rows come back.
	 *
	 * @example `await t.reset()`
	 */
	reset(): Promise<void>
	/**
	 * Sends one in-memory request through the HTTP plugin, without a port,
	 * as a client would: authentication comes from its headers. The request
	 * comes from the local peer `127.0.0.1` unless `options` names another
	 * or none.
	 *
	 * @example `const response = await t.fetch('/api/classes/Task')`
	 */
	fetch(
		path: string,
		init?: RequestInit,
		options?: TestFetchOptions,
	): Promise<Response>
	/**
	 * Runs `fn` as `principal`: schema and operation calls inside it see that
	 * principal in rules and hooks; `undefined` runs it anonymously.
	 *
	 * @example `await t.as(User.pointer(id), () => Task.findMany())`
	 */
	as<TResult>(
		principal: Principal | undefined,
		fn: () => TResult | PromiseLike<TResult>,
	): Promise<Awaited<TResult>>
	/**
	 * Runs `fn` with Master authority, without a configured key: calls inside
	 * it bypass authorization, never validation or hooks.
	 *
	 * @example `await t.asMaster(() => Task.createOne({ data: { title: 'Ship' } }))`
	 */
	asMaster<TResult>(
		fn: () => TResult | PromiseLike<TResult>,
	): Promise<Awaited<TResult>>
	/**
	 * Resolves once pending after-commit work (`afterCommit` hooks, event
	 * consumers) has run, including the work it started; never rejects.
	 *
	 * @example `await t.afterCommit()`
	 */
	afterCommit(): Promise<void>
}

type AnyApplication = UltimaBase<
	readonly SchemaDefinition[],
	readonly PluginDefinition[],
	PluginSourceState
>

interface RunningApplication {
	readonly ultimabase: AnyApplication
	readonly harness: ApplicationHarness
	readonly database: TestDatabase
}

// One initialized application per realm: the one testApplication started.
let running: RunningApplication | undefined

const httpPluginId = '@ultimabase/http-plugin'
// The socket peer of a request to a local server.
const loopbackAddress = '127.0.0.1'

const readFetch = (
	ultimabase: AnyApplication,
): ((request: Request, options: TestFetchOptions) => Promise<Response>) => {
	let exports: unknown
	try {
		exports = ultimabase.plugin(httpPluginId)
	} catch (error: unknown) {
		throw new TypeError(
			't.fetch needs the HTTP plugin: install apiServer() or httpPlugin() in the application',
			{ cause: error },
		)
	}
	const fetch: unknown =
		typeof exports === 'object' && exports !== null
			? Reflect.get(exports, 'fetch')
			: undefined
	if (typeof fetch !== 'function') {
		throw new TypeError('The HTTP plugin of this application exports no fetch')
	}
	return async (request, options) => {
		const response: unknown = await Reflect.apply(fetch, exports, [
			request,
			options,
		])
		if (!(response instanceof Response)) {
			throw new TypeError('The HTTP plugin fetch did not return a Response')
		}
		return response
	}
}

const startApplication = async (
	ultimabase: AnyApplication,
): Promise<RunningApplication> => {
	if (ultimabase.state !== 'idle') {
		throw new TypeError(
			`testApplication starts the application itself on an isolated database; it is already ${ultimabase.state}`,
		)
	}
	const harness = openApplicationHarness(ultimabase)
	const database = await openTestDatabase()
	const previousUrl = process.env.DATABASE_URL
	try {
		// postgresPlugin() reads DATABASE_URL once, at start (ADR-0312).
		process.env.DATABASE_URL = database.applicationUrl
		try {
			await ultimabase.start()
		} finally {
			if (previousUrl === undefined) delete process.env.DATABASE_URL
			else process.env.DATABASE_URL = previousUrl
		}
		// Never reset a database the application did not get from here.
		if ((await database.countApplicationConnections()) === 0) {
			throw new TypeError(
				'testApplication could not isolate this application: its database plugin did not connect through DATABASE_URL. Use postgresPlugin() without url or pool.',
			)
		}
		return { database, harness, ultimabase }
	} catch (error: unknown) {
		try {
			await ultimabase.dispose()
		} finally {
			await database.dispose()
		}
		throw error
	}
}

/**
 * Stops the application `testApplication` started in this realm and drops
 * its schema; `ultimabaseTesting()` calls it after each test file.
 *
 * @internal
 */
export const stopTestApplication = async (): Promise<void> => {
	const current = running
	if (current === undefined) return
	running = undefined
	try {
		await current.ultimabase.dispose()
	} finally {
		await current.database.dispose()
	}
}

const createHandle = (current: RunningApplication): TestApplication => {
	const { harness, ultimabase } = current
	let disposed = false
	const assertOpen = (): void => {
		if (disposed || running !== current) {
			throw new TypeError('This testApplication handle is closed')
		}
	}
	const run = async <TResult>(
		engine: Parameters<typeof runWithRequestEngine>[0],
		fn: () => TResult | PromiseLike<TResult>,
	): Promise<Awaited<TResult>> => await runWithRequestEngine(engine, fn)
	const requestOptions = () => ({ requestId: randomUUID(), source: 'test' })

	const handle: TestApplication = {
		reset: async () => {
			assertOpen()
			await waitForAfterCommitWork()
			await harness.resetDatabase()
		},
		fetch: (path: string, init?: RequestInit, options?: TestFetchOptions) => {
			assertOpen()
			// An explicit `remoteAddress: undefined` asks for no peer.
			const remoteAddress =
				options !== undefined && 'remoteAddress' in options
					? options.remoteAddress
					: loopbackAddress
			return readFetch(ultimabase)(
				new Request(new URL(path, 'http://localhost'), init),
				{ remoteAddress },
			)
		},
		as: <TResult>(
			principal: Principal | undefined,
			fn: () => TResult | PromiseLike<TResult>,
		) => {
			assertOpen()
			const context =
				RequestContext.anonymous(requestOptions()).withPrincipal(principal)
			return run(withContext(ultimabase, context), fn)
		},
		asMaster: async <TResult>(
			fn: () => TResult | PromiseLike<TResult>,
		): Promise<Awaited<TResult>> => {
			assertOpen()
			return run(await harness.master(requestOptions()), fn)
		},
		afterCommit: () => waitForAfterCommitWork(),
		[Symbol.asyncDispose]: async () => {
			if (disposed) return
			disposed = true
			await waitForAfterCommitWork()
		},
	}
	return Object.freeze(handle)
}

/**
 * Starts the production application itself (same plugins, same rules) on
 * this test worker's own PostgreSQL schema, from `TEST_DATABASE_URL` or a
 * container started once (ADR-0327). A later call with the same application
 * reuses it from empty tables, so each test starts from no data.
 *
 * @example
 * ```ts
 * it('creates a task', async () => {
 *   await using t = await testApplication(ultimabase)
 *   await Task.createOne({ data: { title: 'Ship' } })
 *   expect(await Task.count()).toBe(1)
 * })
 * ```
 */
export const testApplication = async <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState,
>(
	ultimabase: UltimaBase<TSchemas, TPlugins, TSource>,
): Promise<TestApplication> => {
	if (process.env.NODE_ENV === 'production') {
		throw new TypeError(
			'testApplication refuses NODE_ENV=production: it empties tables and grants Master without a key',
		)
	}
	const application: AnyApplication = ultimabase
	if (running?.ultimabase === application) {
		await waitForAfterCommitWork()
		await running.harness.resetDatabase()
		return createHandle(running)
	}
	await stopTestApplication()
	running = await startApplication(application)
	return createHandle(running)
}
