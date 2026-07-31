import { describe, expect, it } from 'vitest'

import { snapshotDeclaredFieldValue } from './definition.js'
import type { FieldDefinition } from './contract.js'

describe('field definition provenance', () => {
	it('rejects snapshot capabilities forged outside a field factory', () => {
		const forged: FieldDefinition<'fixture.value', string, object> = {
			kind: 'fixture.value',
			options: {},
		}

		expect(() =>
			snapshotDeclaredFieldValue(forged, 'value', 'default'),
		).toThrow(
			new TypeError('default uses a field not created by a field factory'),
		)
	})
})
