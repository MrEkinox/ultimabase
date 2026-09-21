import type { MaybePromise } from '@ultimabase/shared'

/** Runs immutable transforms in declaration order and feeds replacements forward. */
export const runHookTransformChain = async <THandler, TValue>(
	handlers: readonly THandler[],
	initialValue: TValue,
	invoke: (
		handler: THandler,
		value: TValue,
	) => MaybePromise<TValue | undefined>,
): Promise<TValue> => {
	let value = initialValue

	for (const handler of handlers) {
		const replacement = await invoke(handler, value)

		// An observer-style transform keeps the current value by returning undefined.
		if (replacement !== undefined) {
			value = replacement
		}
	}

	return value
}

/** Executes effects sequentially so declaration order remains observable and deterministic. */
export const runHookEffects = async <THandler>(
	handlers: readonly THandler[],
	invoke: (handler: THandler) => MaybePromise<void>,
): Promise<void> => {
	for (const handler of handlers) {
		await invoke(handler)
	}
}
