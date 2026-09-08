import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { UuidV7Generator } from './identifier-generator.js'
import type { NestedWriteLimits } from '../../schema/nested-writes/contracts.js'
import { normalizeNestedWriteLimits } from '../../schema/nested-writes/limits.js'

/** Configures one application-scoped validation stage and operation clock. */
export interface RuntimeValidationOptions {
	readonly clock?: () => Date
	/** Bounds recursive nested object depth and statically declared graph work. */
	readonly nestedWrites?: Partial<NestedWriteLimits>
	readonly timezone?: string
	readonly uuidV7Generator?: UuidV7Generator
}

const validationOptionKeys = new Set([
	'clock',
	'nestedWrites',
	'timezone',
	'uuidV7Generator',
])

export const emptyRuntimeValidationOptions: RuntimeValidationOptions =
	immutableRecord({})

/** Validates and snapshots caller-owned validation configuration once. */
export const normalizeRuntimeValidationOptions = (
	options: unknown,
): Readonly<RuntimeValidationOptions> => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Runtime validation options must be a plain object')
	}

	for (const key of Object.keys(options)) {
		if (!validationOptionKeys.has(key)) {
			throw new TypeError(`Runtime validation contains unknown option: ${key}`)
		}
	}

	const clock: unknown = options.clock
	const nestedWrites: unknown = options.nestedWrites
	const timezone: unknown = options.timezone
	const uuidV7Generator: unknown = options.uuidV7Generator

	if (clock !== undefined && typeof clock !== 'function') {
		throw new TypeError('Runtime validation clock must be a function')
	}

	if (uuidV7Generator !== undefined && typeof uuidV7Generator !== 'function') {
		throw new TypeError('Runtime UUID v7 generator must be a function')
	}

	if (timezone !== undefined) {
		assertNonEmptyString(timezone, 'Runtime validation timezone')
	}

	// Callable return values remain validated when Runtime invokes their contracts.
	return immutableRecord({
		...(clock === undefined ? {} : { clock: clock as () => Date }),
		...(nestedWrites === undefined
			? {}
			: { nestedWrites: normalizeNestedWriteLimits(nestedWrites) }),
		...(timezone === undefined ? {} : { timezone }),
		...(uuidV7Generator === undefined
			? {}
			: { uuidV7Generator: uuidV7Generator as UuidV7Generator }),
	})
}
