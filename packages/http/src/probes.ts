// `GET /health` and `GET /ready` (D-204): whether the server answers, and
// whether the instance takes traffic. Until every plugin started, the
// server serves nothing else.
import { Hono } from 'hono'
import type { Logger } from 'ultimabase'
import type { Gate } from './upgrade.ts'

/** Whether a service the instance needs is there, read on each `/ready`. */
export type ReadyCheck = () => boolean | Promise<boolean>

/** What `/ready` reads, from the hooks and the plugins' checks. */
export interface Probes {
	started: boolean
	stopping: boolean
	readonly checks: ReadyCheck[]
}

/** A check that throws fails, logged with its error. */
async function passes(check: ReadyCheck, logger: Logger): Promise<boolean> {
	try {
		return await check()
	} catch (error) {
		logger.error({ err: error }, 'A readiness check failed.')
		return false
	}
}

/** Why `/ready` refuses traffic, or `undefined` when it takes it. */
async function unready(
	probes: Probes,
	logger: Logger,
): Promise<string | undefined> {
	if (!probes.started) return 'The application is starting.'
	if (probes.stopping) return 'The application is stopping.'
	const results = await Promise.all(
		probes.checks.map((check) => passes(check, logger)),
	)
	return results.every(Boolean) ? undefined : 'A readiness check failed.'
}

/**
 * The first gate: until every plugin started, a request or an upgrade
 * answers as `/ready` does, Master's too, as a plugin may not be ready.
 */
export function startingGate(probes: Probes): Gate {
	return () =>
		probes.started
			? undefined
			: Response.json(
					{ code: 'UNAVAILABLE', message: 'The application is starting.' },
					{ status: 503 },
				)
}

/** The two routes, served before every other (`get` answers `HEAD` too). */
export function probeRoutes(probes: Probes, logger: Logger): Hono {
	return new Hono()
		.get('/health', (c) => c.json({ status: 'ok' }))
		.get('/ready', async (c) => {
			const message = await unready(probes, logger)
			return message === undefined
				? c.json({ status: 'ok' })
				: c.json({ code: 'UNAVAILABLE', message }, 503)
		})
}
