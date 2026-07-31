import { describe, expect, it } from 'vitest'

import * as runtimeApi from '@ultimabase/runtime'
import * as schemaApi from '@ultimabase/schema'

describe('cross-package public entry points', () => {
	it('loads multiple built packages through their export maps', () => {
		// E2E tests consume built public APIs instead of package source paths.
		expect(schemaApi.stringField().kind).toBe('string')

		const context = runtimeApi.RequestContext.anonymous({
			requestId: 'e2e-request',
			source: runtimeApi.requestSources.internal,
		})

		expect(context.access.mode).toBe('anonymous')
		expect(runtimeApi.RuntimePipeline).toBeTypeOf('function')
	})
})
