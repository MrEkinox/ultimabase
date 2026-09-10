import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

/** Validates one binding's complete declared PluginError-to-status mapping. */
export const readRestErrorStatusMap = (
	metadata: unknown,
	errors: readonly string[],
	operation: string,
): Readonly<Record<string, number>> => {
	if (
		!isPlainRecord(metadata) ||
		Object.keys(metadata).length !== 1 ||
		!Object.hasOwn(metadata, 'errors') ||
		!isPlainRecord(metadata.errors)
	) {
		throw new TypeError(
			`REST binding for operation ${operation} must declare exact error status metadata`,
		)
	}
	const statuses = metadata.errors
	const keys = Object.keys(statuses)
	if (
		keys.length !== errors.length ||
		errors.some((code) => !Object.hasOwn(statuses, code))
	) {
		throw new TypeError(
			`REST binding for operation ${operation} must map every declared public error`,
		)
	}
	for (const [code, status] of Object.entries(statuses)) {
		if (
			!errors.includes(code) ||
			typeof status !== 'number' ||
			!Number.isSafeInteger(status) ||
			status < 400 ||
			status > 599
		) {
			throw new TypeError(
				`REST binding for operation ${operation} has an invalid status for ${code}`,
			)
		}
	}
	return immutableRecord(statuses as Readonly<Record<string, number>>)
}
