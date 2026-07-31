import * as publicApi from '@ultimabase/access'
import { describe, expect, it } from 'vitest'

describe('@ultimabase/access public entry point', () => {
	it('exports only implemented access runtime values', () => {
		// Type-only request contracts must not create runtime placeholders.
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'RequestCapability',
			'accessModes',
		])
	})
})
