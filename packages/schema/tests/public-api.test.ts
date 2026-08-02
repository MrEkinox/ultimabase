import { describe, expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

describe('@ultimabase/schema public entry point', () => {
	it('exports only the current runtime declarations', () => {
		// Type-only field and extension contracts must not leak runtime placeholders.
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'DuplicateSchemaError',
			'Schema',
			'SchemaRegistry',
			'assertFieldOptions',
			'bigintField',
			'binaryField',
			'booleanField',
			'compileValidationPlans',
			'dateField',
			'dateTimeField',
			'decimalField',
			'defineExtensions',
			'defineFieldExtension',
			'definePluginField',
			'defineSchemaExtension',
			'enumField',
			'fieldUsesTemporalTimezone',
			'floatField',
			'intField',
			'isStaticDefault',
			'jsonField',
			'objectField',
			'snapshotScalarFieldValue',
			'stringField',
			'timeField',
			'uuidField',
			'validateScalarFieldConstraints',
		])
	})
})
