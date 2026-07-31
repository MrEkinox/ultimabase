import { describe, expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

describe('@ultimabase/schema public entry point', () => {
	it('exports only the current runtime factories', () => {
		// Type-only field and extension contracts must not leak runtime placeholders.
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'DatabaseDefault',
			'DuplicateSchemaError',
			'SchemaRegistry',
			'bigintField',
			'booleanField',
			'compileValidationPlans',
			'dateField',
			'defineExtensions',
			'defineFieldExtension',
			'defineSchema',
			'defineSchemaExtension',
			'enumField',
			'floatField',
			'getDefaultKind',
			'intField',
			'isStaticDefault',
			'jsonField',
			'objectField',
			'stringField',
			'uuidField',
		])
	})
})
