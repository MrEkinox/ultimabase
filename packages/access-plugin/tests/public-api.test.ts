import { describe, expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

describe('@ultimabase/access-plugin public entry point', () => {
	it('exports one complete official Access authoring surface', () => {
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'accessContributionsCapability',
			'accessDiagnosticsObserverCapability',
			'accessPlugin',
			'allOf',
			'anyOf',
			'defineFieldKindAccessTarget',
			'fieldAccess',
			'fieldKindAccess',
			'globalAccess',
			'not',
			'provideAccessContributions',
			'schemaAccess',
		])
	})
})
