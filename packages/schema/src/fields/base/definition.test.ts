import { describe, expect, it, vi } from 'vitest'

import {
	binaryField,
	snapshotScalarFieldValue,
	stringField,
} from '../../index.js'
import type { FieldDefinition } from './contract.js'
import { snapshotDeclaredFieldValue } from './definition.js'

describe('field definition provenance', () => {
	it('rejects snapshot capabilities forged outside a field factory', () => {
		const forged: FieldDefinition<'fixture.value', string, object> = {
			kind: 'fixture.value',
			options: {},
		}

		expect(() => snapshotScalarFieldValue(forged, 'value', 'default')).toThrow(
			new TypeError('default uses a field not created by a field factory'),
		)
		expect(() =>
			snapshotDeclaredFieldValue(forged, 'value', 'default'),
		).toThrow(
			new TypeError('default uses a field not created by a field factory'),
		)
	})

	it('reuses scalar capabilities to detach mutable input', () => {
		const field = binaryField()
		const source = new Uint8Array([1, 2, 3])
		const snapshot = snapshotScalarFieldValue(field, source, 'value')

		source.fill(9)

		expect(snapshot).toStrictEqual(new Uint8Array([1, 2, 3]))
	})

	it('never selects or executes a field default', () => {
		const runtimeDefault = vi.fn(() => 'generated')
		const field = stringField({ default: runtimeDefault })

		expect(snapshotScalarFieldValue(field, 'provided', 'value')).toBe(
			'provided',
		)
		expect(runtimeDefault).not.toHaveBeenCalled()
	})
})
