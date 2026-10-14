//#region run-plugin-callback
import { throwIfOperationCancelled } from '@ultimabase/core'

/** Checks the signal only at safe boundaries, around the callback. */
export const runPluginCallback = async (
	signal: AbortSignal,
	callback: () => Promise<void>,
) => {
	throwIfOperationCancelled(signal, { phase: 'before-callback' })
	await callback()
	throwIfOperationCancelled(signal, { phase: 'after-callback' })
}
//#endregion run-plugin-callback
