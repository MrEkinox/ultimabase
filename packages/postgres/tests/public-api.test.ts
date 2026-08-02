import * as publicApi from '@ultimabase/postgres'
import { describe, expect, it } from 'vitest'

describe('@ultimabase/postgres public entry point', () => {
	it('exports only the intended framework surface implemented so far', () => {
		// Driver and Drizzle internals must remain absent from runtime exports.
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'postgresColumn',
			'postgresConnectionServiceToken',
			'postgresConstraintCompiler',
			'postgresPlugin',
			'postgresSchemaPreparationClaimName',
			'postgresTable',
		])
		expect(publicApi).not.toHaveProperty('Pool')
		expect(publicApi).not.toHaveProperty('drizzle')
	})
})
