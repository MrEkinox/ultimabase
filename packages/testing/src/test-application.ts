// An application's tests (D-130): before each test it starts as declared, on
// a new memory() and a free port, without info lines; after each it stops.
import { memory } from 'ultimabase'
import type { Lifecycle } from 'ultimabase/internal'
import { quietRuns, runningApi } from 'ultimabase/internal'
import { afterEach, beforeEach } from 'vitest'

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

/**
 * Runs `app`, the value `defineApp` returned, around each test of the file
 * that calls it.
 */
export function testApplication(app: object): TestApplication {
	const runs = quietRuns(app)
	if (runs === undefined) {
		throw new TypeError('testApplication takes the value defineApp returned.')
	}
	let run: Lifecycle | undefined
	beforeEach(async () => {
		run = runs(memory())
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
