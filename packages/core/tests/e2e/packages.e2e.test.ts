import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

import * as coreApi from '@ultimabase/core'

const consumerRequire = createRequire(import.meta.url)
const removedFoundationalPackages = [
	'@ultimabase/access',
	'@ultimabase/query',
	'@ultimabase/runtime',
	'@ultimabase/schema',
] as const

describe('consolidated Core public entry point', () => {
	it('loads Schema and Runtime through one built export map', () => {
		// E2E tests consume the same cohesive package as application developers.
		expect(coreApi.stringField().kind).toBe('string')

		const context = coreApi.RequestContext.anonymous({
			requestId: 'e2e-request',
			source: coreApi.requestSources.internal,
		})

		expect(context.access.mode).toBe('anonymous')
		expect(coreApi.RuntimePipeline).toBeTypeOf('function')
		expect(coreApi.throwIfOperationCancelled).toBeTypeOf('function')
	})

	it('does not retain pre-release compatibility package facades', () => {
		// Removed entry points must not hide a second copy of foundational classes.
		for (const packageName of removedFoundationalPackages) {
			expect(() => consumerRequire.resolve(packageName)).toThrow()
		}
	})
})
