import { describe, expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

describe('@ultimabase/shared public entry point', () => {
	it('loads as an ESM module', () => {
		// The NodeNext output extension exercises the production import syntax.
		expect(Object.keys(publicApi)).toStrictEqual([])
	})
})
