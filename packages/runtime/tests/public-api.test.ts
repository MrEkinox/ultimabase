import * as publicApi from '@ultimabase/runtime'
import { describe, expect, it } from 'vitest'

describe('@ultimabase/runtime public entry point', () => {
	it('omits the trusted master constructor from public exports', () => {
		// Master context construction stays inside Runtime until authority is audited.
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'BoundQuery',
			'FrameworkEngine',
			'RequestContext',
			'RequestEngine',
			'RuntimePipeline',
			'databaseAdapterServiceToken',
			'getCurrentApplication',
			'getCurrentApplicationEngine',
			'getCurrentEngine',
			'getCurrentFrameworkContext',
			'getCurrentRequest',
			'requestSources',
			'runWithRequestEngine',
		])
		expect(publicApi).not.toHaveProperty('createTrustedMasterRequestContext')
		expect(publicApi).not.toHaveProperty('createTrustedMasterRequestEngine')
	})
})
