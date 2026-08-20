import { describe, expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

describe('@ultimabase/hooks-plugin public entry point', () => {
	it('exports only official authoring contracts and the optional implementation', () => {
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'HookContext',
			'defineEvent',
			'fieldHookPhases',
			'fieldHooks',
			'fieldHooksOption',
			'globalHooks',
			'hookContributionsCapability',
			'hookDiagnosticsObserverCapability',
			'hookEventContributionsCapability',
			'hooksPlugin',
			'normalizeFieldHookDeclarations',
			'normalizeSchemaHookDeclarations',
			'onEvent',
			'provideHookContributions',
			'provideHookEvent',
			'schemaExtensionHooks',
			'schemaHookPhases',
			'schemaHooks',
			'schemaHooksOption',
		])
	})
})
