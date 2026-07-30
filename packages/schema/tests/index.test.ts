import { describe, expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

describe('@ultimabase/schema field contract', () => {
	it('remains type-only at runtime', () => {
		// Field contracts describe static schemas without adding runtime state.
		expect(Object.keys(publicApi)).toStrictEqual([])
	})
})
