// What a viewer is set up with, and what it does with them: when its caller
// stops holding, and who hears that it closed.
import type { Caller, ExposedFunction, ExposedModel, Logger } from 'ultimabase'
import { PublicError } from 'ultimabase'
import { recording } from 'ultimabase/internal'
import type { Gate } from './gate.ts'

export type Settings = {
	readonly models: readonly ExposedModel<{ readonly maxLive?: number }>[]
	readonly functions: readonly ExposedFunction<{ readonly debounce?: number }>[]
	readonly maxLive: number
	readonly maxSubscriptions: number
	readonly maxConnectionRows: number
	readonly identify: (request: Request) => Promise<Caller>
	readonly logger: Logger
	/** What a caller's first read and a live read's first read wait for. */
	readonly opens: Gate
}

/** The least wait before a rebuild, so a past expiry is no hot loop. */
const soonest = 1000
/** The longest wait `setTimeout` keeps. */
const latest = 2 ** 31 - 1

export type Built<R> = Awaited<ReturnType<typeof recording<R>>>

/**
 * The caller built again. `failed` says that the server failed, which tells
 * nothing of the caller, as a public refusal does (D-278).
 */
export async function builtAgain(
	settings: Settings,
	request: Request,
): Promise<{ readonly identified?: Built<Caller>; readonly failed: boolean }> {
	try {
		const identified = await recording(async () => settings.identify(request))
		return { identified, failed: false }
	} catch (error) {
		const failed = !(error instanceof PublicError)
		if (failed) {
			settings.logger.error({ err: error }, 'A live caller was not read.')
		}
		return { failed }
	}
}

/** The rows a live list of `model` follows at most. */
export function limitOf(settings: Settings, model: string): number {
	const exposed = settings.models.find(({ schema }) => schema.name === model)
	return exposed?.with?.maxLive ?? settings.maxLive
}

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
