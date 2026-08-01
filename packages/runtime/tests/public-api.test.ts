import * as publicApi from '@ultimabase/runtime'
import { describe, expect, it } from 'vitest'

describe('@ultimabase/runtime public entry point', () => {
	it('exports audited authority while omitting trusted context constructors', () => {
		// Opaque grants are public values, but their constructor remains private.
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'BoundQuery',
			'FrameworkEngine',
			'MasterAuthority',
			'MasterKeyGrant',
			'RequestContext',
			'RequestEngine',
			'RuntimePipeline',
			'afterOperation',
			'beforeOperation',
			'createFrameworkEngine',
			'createRuntimeHookStages',
			'createRuntimeValidationStage',
			'databaseAdapterServiceToken',
			'getCurrentApplication',
			'getCurrentApplicationEngine',
			'getCurrentEngine',
			'getCurrentFrameworkContext',
			'getCurrentRequest',
			'postCommitEvent',
			'requestSources',
			'runWithRequestEngine',
			'runtimePipelineStage',
		])
		expect(publicApi).not.toHaveProperty('createTrustedMasterRequestContext')
		expect(publicApi).not.toHaveProperty('createTrustedMasterRequestEngine')
	})
})
