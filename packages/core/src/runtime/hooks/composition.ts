import type { MaybePromise } from '@ultimabase/shared'

/** Runs immutable transforms in declaration order and feeds replacements forward. */
export const runHookTransformChain = async <THandler, TValue>(
	handlers: readonly THandler[],
	initialValue: TValue,
	invoke: (
		handler: THandler,
		value: TValue,
		index: number,
	) => MaybePromise<TValue | undefined>,
): Promise<TValue> => {
	let value = initialValue

	for (const [index, handler] of handlers.entries()) {
		const replacement = await invoke(handler, value, index)

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
	invoke: (handler: THandler, index: number) => MaybePromise<void>,
): Promise<void> => {
	for (const [index, handler] of handlers.entries()) {
		await invoke(handler, index)
	}
}
