import { describe, expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

describe('@ultimabase/pg-vector-plugin public entry point', () => {
	it('exports only the vector field and plugin factories', () => {
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'isVectorFieldValidationPlan',
			'pgVectorPlugin',
			'vectorField',
			'vectorFieldKind',
		])
	})
})
