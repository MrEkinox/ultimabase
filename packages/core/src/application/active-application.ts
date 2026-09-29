import { AsyncLocalStorage } from 'node:async_hooks'

interface ApplicationOwner {
	readonly state: string
}

interface ActiveApplication {
	readonly owner: ApplicationOwner
	readonly work: Set<Promise<void>>
	accepting: boolean
}

interface ExecutionScope {
	readonly application: ActiveApplication
	active: boolean
}

// This slot owns lifecycle exclusivity and the sole outside-request owner only.
let active: ActiveApplication | undefined
const execution = new AsyncLocalStorage<ExecutionScope>()

/** Claims ownership before any capability factory or plugin setup can run. */
export const acquireApplication = (owner: ApplicationOwner): void => {
	if (active !== undefined && active.owner !== owner) {
		throw new TypeError(
			'Another UltimaBase application is active. Await its dispose() before initializing another application in this JavaScript realm.',
		)
	}
	active ??= { owner, work: new Set(), accepting: true }
}

const hasActiveScope = (application: ActiveApplication): boolean => {
	const scope = execution.getStore()
	return scope?.application === application && scope.active
}

/** Identifies admitted work only; an inherited but settled async scope grants nothing. */
export const isRunningApplicationWork = (owner: ApplicationOwner): boolean =>
	active?.owner === owner && hasActiveScope(active)

/** Reads the sole lifecycle owner without selecting request authority. */
export const readActiveApplicationOwner = (): ApplicationOwner | undefined =>
	active?.owner

/** Rejects inert and stale engines, including callbacks escaped from completed work. */
export const assertApplicationExecution = (owner: ApplicationOwner): void => {
	if (
		active?.owner !== owner ||
		(!hasActiveScope(active) &&
			(!active.accepting ||
				(owner.state !== 'ready' &&
					owner.state !== 'starting' &&
					owner.state !== 'started')))
	) {
		throw new TypeError(
			`Framework engine requires its initialized active application; received ${owner.state}`,
		)
	}
}

/** Avoids waiting for a callback that is itself awaiting its own teardown. */
export const assertOutsideApplicationWork = (owner: ApplicationOwner): void => {
	if (active?.owner === owner && hasActiveScope(active)) {
		throw new TypeError(
			'Stop or dispose the application outside its active request callback',
		)
	}
}

/** Tracks both synchronous callbacks and their returned promises without changing types. */
export const runApplicationWork = <TResult>(
	owner: ApplicationOwner,
	callback: () => TResult,
): TResult => {
	assertApplicationExecution(owner)
	const application = active
	if (application === undefined)
		throw new TypeError('Application ownership is unavailable')
	const scope: ExecutionScope = { application, active: true }
	const completed = Promise.withResolvers<undefined>()
	application.work.add(completed.promise)
	const finish = (): void => {
		scope.active = false
		application.work.delete(completed.promise)
		completed.resolve(undefined)
	}
	try {
		const result = execution.run(scope, callback)
		if (
			result !== null &&
			(typeof result === 'object' || typeof result === 'function') &&
			'then' in result &&
			typeof result.then === 'function'
		) {
			// Observe settlement without replacing the caller's exact result or rejection.
			void Promise.resolve(result).then(finish, finish)
		} else {
			finish()
		}
		return result
	} catch (error: unknown) {
		finish()
		throw error
	}
}

/** Closes new execution synchronously; existing owned work may finish nested operations. */
export const closeApplicationExecution = (owner: ApplicationOwner): void => {
	assertOutsideApplicationWork(owner)
	if (active?.owner === owner) active.accepting = false
}

/** Includes work started by an already admitted callback while shutdown is waiting. */
export const drainApplicationWork = async (
	owner: ApplicationOwner,
): Promise<void> => {
	const application = active
	if (application?.owner !== owner) return
	while (application.work.size > 0) await Promise.all(application.work)
}

/** Only successful resource cleanup may release this exact owner. */
export const releaseApplication = (owner: ApplicationOwner): void => {
	if (active?.owner === owner) active = undefined
}
