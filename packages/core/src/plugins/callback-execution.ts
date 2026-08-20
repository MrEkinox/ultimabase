import { AsyncLocalStorage } from 'node:async_hooks'

import { immutableRecord } from '@ultimabase/shared'

import type { PluginIdentity } from './manifest.js'

interface ApplicationCallbackExecutionState {
	readonly application: object
	readonly owner: PluginIdentity | undefined
}

const callbackExecutionStorage =
	new AsyncLocalStorage<ApplicationCallbackExecutionState>()

/** Runs nested engine callbacks with provenance retained by their declaration host. */
export interface ApplicationCallbackExecutor {
	/** Replaces an outer plugin scope with trusted application callback ownership. */
	runApplication<TResult>(callback: () => TResult): TResult
	/** Replaces an outer scope with one exact installed plugin instance. */
	runPlugin<TResult>(owner: PluginIdentity, callback: () => TResult): TResult
}

const assertCallback: (
	callback: unknown,
) => asserts callback is () => unknown = (callback) => {
	if (typeof callback !== 'function') {
		throw new TypeError('Attributed callback must be a function')
	}
}

/** @internal Opens one Core-known plugin boundary for its complete async lifetime. */
export const runWithApplicationPluginOwner = <TResult>(
	application: object,
	owner: PluginIdentity,
	callback: () => TResult,
): TResult =>
	callbackExecutionStorage.run(
		immutableRecord({ application, owner: immutableRecord(owner) }),
		callback,
	)

/** @internal Reads only the owner attributed to this exact application. */
export const readApplicationPluginOwner = (
	application: object,
): PluginIdentity | undefined => {
	const active = callbackExecutionStorage.getStore()

	return active?.application === application ? active.owner : undefined
}

/** @internal Creates the non-rebindable executor supplied to capability factories. */
export const createApplicationCallbackExecutor = (
	application: object,
	assertInstalledOwner: (owner: PluginIdentity) => void,
): ApplicationCallbackExecutor =>
	immutableRecord({
		runApplication: <TResult>(callback: () => TResult): TResult => {
			assertCallback(callback)
			return callbackExecutionStorage.run(
				immutableRecord({ application, owner: undefined }),
				callback,
			)
		},
		runPlugin: <TResult>(
			owner: PluginIdentity,
			callback: () => TResult,
		): TResult => {
			assertCallback(callback)
			assertInstalledOwner(owner)
			return runWithApplicationPluginOwner(application, owner, callback)
		},
	})
