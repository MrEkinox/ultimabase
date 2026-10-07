import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'

const canonicalValue = (value: unknown, ancestors: WeakSet<object>): string => {
	if (value === null) return 'null'
	if (typeof value === 'string') return `string:${JSON.stringify(value)}`
	if (typeof value === 'boolean') return value ? 'boolean:1' : 'boolean:0'
	if (typeof value === 'bigint') return `bigint:${value.toString()}`
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new TypeError('GraphQL cursor fingerprint requires finite numbers')
		}
		return `number:${Object.is(value, -0) ? '0' : String(value)}`
	}
	if (value instanceof Uint8Array) {
		return `bytes:${Buffer.from(value).toString('base64url')}`
	}
	if (typeof value !== 'object') {
		throw new TypeError('GraphQL cursor fingerprint value is unsupported')
	}
	if (ancestors.has(value)) {
		throw new TypeError('GraphQL cursor fingerprint value must not be cyclic')
	}
	ancestors.add(value)
	try {
		if (isUnknownArray(value)) {
			return `array:[${value
				.map((entry) => canonicalValue(entry, ancestors))
				.join(',')}]`
		}
		if (!isPlainRecord(value)) {
			throw new TypeError(
				'GraphQL cursor fingerprint objects must be plain records',
			)
		}
		if (Reflect.ownKeys(value).some((key) => typeof key !== 'string')) {
			throw new TypeError(
				'GraphQL cursor fingerprint objects must use string keys',
			)
		}
		return `object:{${Object.keys(value)
			.sort()
			.map(
				(key) =>
					`${JSON.stringify(key)}:${canonicalValue(value[key], ancestors)}`,
			)
			.join(',')}}`
	} finally {
		ancestors.delete(value)
	}
}

/** Hashes the connection-defining filter and ordered field priorities. */
export const fingerprintGraphqlConnection = (
	where: unknown,
	order: Readonly<Record<string, 'asc' | 'desc'>>,
): string =>
	createHash('sha256')
		.update(
			canonicalValue(
				{
					order: Object.entries(order),
					where: where ?? null,
				},
				new WeakSet(),
			),
			'utf8',
		)
		.digest('hex')
