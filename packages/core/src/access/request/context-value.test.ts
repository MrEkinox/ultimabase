import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { RequestContextValue } from './context-value.js'

interface FixturePrincipal {
	readonly id: string
}

/** Validates and detaches the fixture identity exactly like an auth plugin. */
const snapshotPrincipal = (value: unknown): FixturePrincipal => {
	if (!isPlainRecord(value) || typeof value.id !== 'string') {
		throw new TypeError('Fixture principal must contain a string id')
	}

	return immutableRecord({ id: value.id })
}

describe('RequestContextValue', () => {
	it('owns one immutable validation and snapshot boundary', () => {
		const principal = new RequestContextValue<FixturePrincipal>(
			'fixture.principal',
			snapshotPrincipal,
		)
		const source = { id: 'user-1' }
		const snapshot = principal.snapshot(source)

		source.id = 'changed'

		expect(snapshot).toStrictEqual({ id: 'user-1' })
		expect(Object.isFrozen(snapshot)).toBe(true)
		expect(Object.isFrozen(principal)).toBe(true)
	})

	it('keeps matching diagnostic names as distinct identities', () => {
		const first = new RequestContextValue<FixturePrincipal>(
			'fixture.principal',
			snapshotPrincipal,
		)
		const second = new RequestContextValue<FixturePrincipal>(
			'fixture.principal',
			snapshotPrincipal,
		)

		expect(first).not.toBe(second)
		expect(first.name).toBe(second.name)
	})

	it('rejects malformed definitions and values', () => {
		expect(() => new RequestContextValue('', snapshotPrincipal)).toThrow(
			new TypeError('Request context value name must be a non-empty string'),
		)
		expect(
			() =>
				new RequestContextValue<FixturePrincipal>(
					'fixture.principal',
					// @ts-expect-error -- JavaScript callers still receive runtime validation.
					null,
				),
		).toThrow(
			new TypeError('Request context value snapshot must be a function'),
		)

		const principal = new RequestContextValue<FixturePrincipal>(
			'fixture.principal',
			snapshotPrincipal,
		)

		expect(() => principal.snapshot({ id: 1 })).toThrow(
			new TypeError('Fixture principal must contain a string id'),
		)
	})
})
