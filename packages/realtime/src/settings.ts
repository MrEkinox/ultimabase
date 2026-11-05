// What a viewer is set up with, and what it does with them: when its caller
// stops holding, and who hears that it closed.
import type { Caller, ExposedFunction, ExposedModel, Logger } from 'ultimabase'

export type Settings = {
	readonly models: readonly ExposedModel<{ readonly maxLive?: number }>[]
	readonly functions: readonly ExposedFunction<{ readonly debounce?: number }>[]
	readonly maxLive: number
	readonly maxSubscriptions: number
	readonly maxConnectionRows: number
	readonly identify: (request: Request) => Promise<Caller>
	readonly logger: Logger
}

/** The least wait before a rebuild, so a past expiry is no hot loop. */
const soonest = 1000
/** The longest wait `setTimeout` keeps. */
const latest = 2 ** 31 - 1

/** How long until the earliest of `times`, `undefined` without any. */
export function waitUntil(
	times: readonly (Date | undefined)[],
): number | undefined {
	const at = times.flatMap((time) => time?.getTime() ?? [])
	if (at.length === 0) return undefined
	return Math.min(Math.max(Math.min(...at) - Date.now(), soonest), latest)
}

/** Runs each listener once; one that throws is logged, not the others. */
export function told(listeners: (() => void)[], logger: Logger): void {
	for (const listener of listeners.splice(0)) {
		try {
			listener()
		} catch (error) {
			logger.error({ err: error }, 'A close listener failed.')
		}
	}
}
