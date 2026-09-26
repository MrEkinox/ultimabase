import { immutableRecord } from '@ultimabase/shared'

/** Retains one delayed builder invocation without exposing it as Runtime data. */
export interface CapturedBuilderCall {
	readonly methodName: string
	readonly options: unknown
}

export type CapturedBuilderCallRegistry<TValue> = readonly [
	capture: (methodName: string, options: unknown) => TValue,
	is: (value: unknown) => value is CapturedBuilderCall,
]

/** Creates one identity-isolated capture boundary for a concrete builder family. */
export const createCapturedBuilderCallRegistry = <
	TValue,
>(): CapturedBuilderCallRegistry<TValue> => {
	const calls = new WeakSet<object>()
	const capture = (methodName: string, options: unknown): TValue => {
		const call = immutableRecord({ methodName, options })
		calls.add(call)
		return call as unknown as TValue
	}
	const is = (value: unknown): value is CapturedBuilderCall =>
		typeof value === 'object' && value !== null && calls.has(value)

	return [capture, is] as const
}
