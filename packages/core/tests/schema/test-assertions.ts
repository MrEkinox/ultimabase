/** Returns a required test value while producing a useful failure at runtime. */
export const requireDefined = <TValue>(
	value: TValue | undefined,
	path: string,
): TValue => {
	if (value === undefined) {
		throw new TypeError(`Expected ${path} to be defined`)
	}

	return value
}

/** Narrows one runtime snapshot to the object shape required by a focused test. */
export const requireRecord = (
	value: unknown,
	path: string,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`Expected ${path} to be an object`)
	}

	return value
}

/** Narrows one runtime snapshot to a list without asserting its element type. */
export const requireArray = (
	value: unknown,
	path: string,
): readonly unknown[] => {
	if (!Array.isArray(value)) {
		throw new TypeError(`Expected ${path} to be a list`)
	}

	return value
}
import { isPlainRecord } from '@ultimabase/shared'
