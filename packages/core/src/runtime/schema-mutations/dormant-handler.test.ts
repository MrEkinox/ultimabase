import { expect, it } from 'vitest'
import { applicationFixture } from '../../../tests/application-fixture.js'

import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import {
	defineOperationValue,
	definePlugin,
	defineSchemaMutation,
} from '../../foundation.js'
import { UltimaBase } from '../application/ultima-base.js'
import {
	provideSchemaMutationHandler,
	schemaMutationHandler,
} from './capabilities.js'

// An unselected declaration must not demand a schema or execute its handler.
it('keeps a valid handler dormant when no schema selects its mutation', async () => {
	const dormantMutation = defineSchemaMutation({
		authority: 'request',
		effect: 'update',
		input: defineOperationValue((value) => value),
		name: 'fixture.schema-mutation.dormant',
		returning: 'after',
		version: '1.0.0',
	})
	const dormantOwner = definePlugin({
		capabilities: [
			provideSchemaMutationHandler({
				contributionId: 'dormant-handler',
				create: () => ({
					value: schemaMutationHandler({
						mutation: dormantMutation,
						resolve: () => ({ data: {} }),
					}),
				}),
			}),
		],
		core: '^0.0.0',
		declare: ({ operations }) => {
			operations.declare(dormantMutation)
		},
		pluginId: 'fixture.schema-mutation-dormant',
		privileges: [
			{ name: 'operation:declare', reason: 'Declares an optional mutation.' },
			{ name: 'persistence:rewrite', reason: 'Owns its optional effect.' },
		] as const,
		version: '1.0.0',
	})
	const database = definePlugin({
		capabilities: [
			provideTestDatabaseAdapter(new RecordingDatabaseAdapter([], [])),
		],
		core: '^0.0.0',
		pluginId: 'fixture.schema-mutation-dormant-database',
		version: '1.0.0',
	})
	const ultimabase = applicationFixture(
		new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [database, dormantOwner],
			schemas: [],
		}),
	)

	await expect(ultimabase.start()).resolves.toBeUndefined()
	await ultimabase.dispose()
})
