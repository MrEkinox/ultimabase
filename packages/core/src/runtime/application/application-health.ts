import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import type { ApplicationLog } from '../../application/application-log.js'
import {
	databaseAdapterCapability,
	isDatabaseAdapter,
} from '../database/contracts.js'

/** Reports whether a started application reaches its database (ADR-0303). */
export type ApplicationHealthStatus = 'OK' | 'DEGRADED'

/** Bounds one adapter health check so a stalled database reports `DEGRADED`. */
export const applicationHealthTimeoutMs = 2_000

/**
 * Runs the adapter's required `checkHealth` within the bound. Never throws:
 * any failure, timeout or non-started state reports `DEGRADED`, and the cause
 * goes only to the server log.
 */
export const checkApplicationHealth = async (
	started: boolean,
	adapter: unknown,
	log: ApplicationLog,
): Promise<ApplicationHealthStatus> => {
	if (!started || !isDatabaseAdapter(adapter)) return 'DEGRADED'
	if (typeof Reflect.get(adapter, 'checkHealth') !== 'function') {
		log.error('UltimaBase: the database adapter does not implement checkHealth')
		return 'DEGRADED'
	}
	const controller = new AbortController()
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<'timeout'>((resolve) => {
		timer = setTimeout(() => {
			controller.abort(
				new DOMException('Database health check timed out', 'TimeoutError'),
			)
			resolve('timeout')
		}, applicationHealthTimeoutMs)
	})
	try {
		const outcome = await Promise.race([
			adapter.checkHealth(controller.signal).then(() => 'answered' as const),
			timeout,
		])
		if (outcome === 'timeout') {
			log.error('UltimaBase: the database health check timed out', {
				timeoutMs: applicationHealthTimeoutMs,
			})
			return 'DEGRADED'
		}
		return 'OK'
	} catch (error: unknown) {
		log.error(
			'UltimaBase: the database health check failed',
			typeof error === 'object' && error !== null ? error : { error },
		)
		return 'DEGRADED'
	} finally {
		clearTimeout(timer)
	}
}

/**
 * Reports one application's health as `ultimabase.health()` does, for the
 * facade and for transports through the request executor (ADR-0303, ADR-0323).
 */
export const readApplicationHealth = (
	application: Readonly<{ readonly state: string }>,
): Promise<ApplicationHealthStatus> => {
	const started = application.state === 'started'
	const kernel = readApplicationKernelState(application)
	return checkApplicationHealth(
		started,
		started ? kernel.capability(databaseAdapterCapability) : undefined,
		kernel.log,
	)
}
