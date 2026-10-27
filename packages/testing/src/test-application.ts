// An application's tests (D-130): before each test it starts as declared, on
// a new memory() or its declared database's test tables (D-137) and a free
// port, without info lines; after each it stops.
import type { Adapter } from 'ultimabase'
import { memory } from 'ultimabase'
import type { Lifecycle } from 'ultimabase/internal'
import { quietRuns, runningApi, scratchOf } from 'ultimabase/internal'
import { afterEach, beforeAll, beforeEach } from 'vitest'

export type TestApplication = {
	/** The HTTP server's address during a test, such as `http://localhost:54321`. */
	readonly url: string
}

/** Starts `run` with `PORT` set to `0`, then puts `PORT` back. */
async function onFreePort(run: Lifecycle): Promise<void> {
	const port = process.env['PORT']
	process.env['PORT'] = '0'
	try {
		await run.start()
	} finally {
		if (port === undefined) delete process.env['PORT']
		else process.env['PORT'] = port
	}
}

function urlOf(api: unknown): string | undefined {
	if (typeof api !== 'object' || api === null || !('url' in api)) {
		return undefined
	}
	const { url } = api
	if (typeof url !== 'function') return undefined
	const value: unknown = Reflect.apply(url, api, [])
	return typeof value === 'string' ? value : undefined
}

export type TestOptions = {
	/**
	 * `'declared'` runs the tests on the application's own database, in
	 * tables of the file's own, instead of a new `memory()`.
	 */
	readonly database?: 'declared'
}

/** The declared database, which gives each test file empty tables. */
function declared(database: Adapter): () => Adapter {
	// A database that starts empty every time, as memory(), needs nothing.
	if (database.migrations === undefined) return () => database
	const scratch = scratchOf(database)
	if (scratch === undefined) {
		throw new TypeError(
			"testApplication runs on the declared database when it gives a test file tables of its own, as postgres() does; this one does not: remove { database: 'declared' }.",
		)
	}
	beforeAll(() => scratch().drop)
	return () => database
}

/**
 * Runs `app`, the value `defineApp` returned, around each test of the file
 * that calls it.
 */
export function testApplication(
	app: object,
	options: TestOptions = {},
): TestApplication {
	const runs = quietRuns(app)
	if (runs === undefined) {
		throw new TypeError('testApplication takes the value defineApp returned.')
	}
	const database =
		options.database === 'declared' ? declared(runs.declared) : memory
	let run: Lifecycle | undefined
	beforeEach(async () => {
		run = runs.on(database())
		await onFreePort(run)
	})
	afterEach(async () => {
		await run?.stop()
		run = undefined
	})
	return {
		get url() {
			const url = run === undefined ? undefined : urlOf(runningApi('http'))
			if (url === undefined) {
				throw new Error(
					'url is the address of httpPlugin(), read during a test: add httpPlugin() to the application.',
				)
			}
			return url
		},
	}
}
