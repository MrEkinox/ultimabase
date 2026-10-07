import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { OperationOptions } from './options.js'

/** @internal Carries validated server-only choices outside every operation AST. */
export interface NormalizedOperationOptions {
	readonly context: object | undefined
	readonly useMasterKey: boolean
}

export const emptyNormalizedOperationOptions: NormalizedOperationOptions =
	immutableRecord({
		context: undefined,
		useMasterKey: false,
	})

const assertKnownOptionKeys = (
	options: Readonly<Record<string, unknown>>,
): void => {
	for (const key of Object.keys(options)) {
		if (key !== 'context' && key !== 'useMasterKey') {
			throw new TypeError(`operation options contain unknown key: ${key}`)
		}
	}
}

const normalizeOperationAuthority = (
	options: Readonly<Record<string, unknown>>,
): NormalizedOperationOptions => {
	const context: unknown = options.context
	const useMasterKey: unknown = options.useMasterKey

	if (
		context !== undefined &&
		(typeof context !== 'object' || context === null)
	) {
		throw new TypeError('operation context must be a RequestContext instance')
	}
	if (useMasterKey !== undefined && useMasterKey !== true) {
		throw new TypeError('operation useMasterKey must be true when present')
	}

	return immutableRecord({
		context,
		useMasterKey: useMasterKey === true,
	})
}

/** Snapshots the public terminal boundary before asynchronous execution starts. */
export const normalizeOperationOptions = (
	options: OperationOptions | undefined,
): NormalizedOperationOptions => {
	if (options === undefined) return emptyNormalizedOperationOptions

	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('operation options must be a plain object')
	}
	assertKnownOptionKeys(untrustedOptions)
	return normalizeOperationAuthority(untrustedOptions)
}
