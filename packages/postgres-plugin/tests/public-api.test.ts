import * as publicApi from '@ultimabase/postgres-plugin'
import { describe, expect, it } from 'vitest'

describe('@ultimabase/postgres-plugin public entry point', () => {
	it('exports only the intended framework surface implemented so far', () => {
		// Driver and Drizzle internals must remain absent from runtime exports.
		expect(Object.keys(publicApi).sort()).toStrictEqual([
			'postgresAdapterId',
			'postgresConnectionCapability',
			'postgresConstraintCompiler',
			'postgresMigrationContributionCapability',
			'postgresPhysicalColumn',
			'postgresPhysicalSchemaContributionCapability',
			'postgresPlugin',
			'postgresPluginName',
			'postgresRawAdapterCapability',
			'postgresSchemaPreparationCapability',
			'postgresUpgrade',
		])
		expect(publicApi).not.toHaveProperty('Pool')
		expect(publicApi).not.toHaveProperty('drizzle')
	})
})
