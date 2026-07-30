import { describe, expect, it } from 'vitest'

import * as runtimeApi from '@ultimabase/runtime'
import * as schemaApi from '@ultimabase/schema'

describe('cross-package public entry points', () => {
	it('loads multiple built packages through their export maps', () => {
		// E2E tests consume built public APIs instead of package source paths.
		expect(schemaApi.stringField().kind).toBe('string')
		expect(Object.keys(runtimeApi)).toHaveLength(0)
	})
})
