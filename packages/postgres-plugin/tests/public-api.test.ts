import * as publicApi from '@ultimabase/postgres-plugin'
import { describe, expect, it } from 'vitest'

describe('@ultimabase/postgres-plugin public entry point', () => {
	it('exports only the intended framework surface implemented so far', () => {
		// Driver and Drizzle internals must remain absent from runtime exports.
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'postgresColumn',
			'postgresConnectionCapability',
			'postgresConstraintCompiler',
			'postgresPlugin',
			'postgresPluginName',
			'postgresSchemaPreparationCapability',
			'postgresTable',
		])
		expect(publicApi).not.toHaveProperty('Pool')
		expect(publicApi).not.toHaveProperty('drizzle')
	})
})
