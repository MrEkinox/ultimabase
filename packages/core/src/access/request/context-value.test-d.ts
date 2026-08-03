import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { expectTypeOf, test } from 'vitest'

import {
	type InferRequestContextValue,
	RequestContextValue,
} from './context-value.js'

interface FixturePrincipal {
	readonly id: string
}

const principal = new RequestContextValue<FixturePrincipal>(
	'fixture.principal',
	(value: unknown): FixturePrincipal => {
		if (!isPlainRecord(value) || typeof value.id !== 'string') {
			throw new TypeError('Fixture principal must contain a string id')
		}

		return immutableRecord({ id: value.id })
	},
)

test('retains the exact plugin-owned value type nominally', () => {
	const snapshot = (value: unknown): FixturePrincipal =>
		principal.snapshot(value)

	expectTypeOf<
		InferRequestContextValue<typeof principal>
	>().toEqualTypeOf<FixturePrincipal>()
	expectTypeOf(snapshot).parameter(0).toEqualTypeOf<unknown>()
	expectTypeOf(snapshot).returns.toEqualTypeOf<FixturePrincipal>()

	// @ts-expect-error -- A matching public shape cannot forge the nominal token.
	const forged: RequestContextValue<FixturePrincipal> = {
		name: 'fixture.principal',
		snapshot: () => ({ id: 'user-1' }),
	}

	expectTypeOf(forged).toBeObject()
})
