import { isUnknownArray } from '@ultimabase/shared'

const hasRows = (
	value: unknown,
): value is Readonly<{ readonly rows: unknown }> =>
	typeof value === 'object' && value !== null && 'rows' in value

/** Reads the structural row list accepted from plain fixtures and pg result instances. */
export const readPostgresQueryRows = (
	result: unknown,
	context: string,
): readonly unknown[] => {
	if (!hasRows(result) || !isUnknownArray(result.rows)) {
		throw new TypeError(`${context} returned an invalid result`)
	}

	return result.rows
}
