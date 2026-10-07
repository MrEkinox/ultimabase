import { expectTypeOf, test } from 'vitest'

import { binaryField, snapshotScalarFieldValue } from '../../index.js'

test('returns the exact declared field value after snapshotting unknown input', () => {
	const field = binaryField({ list: true })
	const value = snapshotScalarFieldValue(field, unknownValue, 'input.payload')

	// Scalar snapshots deliberately ignore the field's list wrapper.
	expectTypeOf(value).toEqualTypeOf<Uint8Array>()
})

declare const unknownValue: unknown
