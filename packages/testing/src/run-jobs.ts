// `runJobs()` (D-221): a test runs the due runs of `jobsPlugin()`, and those
// they enqueue, until none is due. A test that waits advances the clock with
// `vi.setSystemTime`.
import { runningApi } from 'ultimabase/internal'

/** The jobs plugin's `drain`, read without depending on the plugin. */
function drainOf(api: unknown): (() => unknown) | undefined {
	if (typeof api !== 'object' || api === null || !('drain' in api)) {
		return undefined
	}
	const { drain } = api
	if (typeof drain !== 'function') return undefined
	return () => {
		const done: unknown = Reflect.apply(drain, api, [])
		return done
	}
}

/** Runs the jobs due now, and those their runs enqueue, until none is due. */
export async function runJobs(): Promise<void> {
	const drain = drainOf(runningApi('jobs'))
	if (drain === undefined) {
		throw new Error(
			'runJobs() runs during a test of an application with jobsPlugin().',
		)
	}
	await drain()
}
