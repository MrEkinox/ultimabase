import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { UuidV7Generator } from './identifier-generator.js'

/** Configures one application-scoped validation stage and operation clock. */
export interface RuntimeValidationOptions {
	readonly clock?: () => Date
	readonly timezone?: string
	readonly uuidV7Generator?: UuidV7Generator
}

const validationOptionKeys = new Set(['clock', 'timezone', 'uuidV7Generator'])

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
		...(timezone === undefined ? {} : { timezone }),
		...(uuidV7Generator === undefined
			? {}
			: { uuidV7Generator: uuidV7Generator as UuidV7Generator }),
	})
}
