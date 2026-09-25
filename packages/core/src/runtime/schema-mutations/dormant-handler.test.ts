import { expect, it } from 'vitest'
import { applicationFixture } from '../../../tests/application-fixture.js'

import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import {
	defineOperationValue,
	plugin as createPlugin,
	contributeDeclarations,
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
	const dormantOwner = createPlugin({
		core: '^0.0.0',
		id: 'fixture.schema-mutation-dormant',
		permissions: {
			'operation:declare': 'Declares an optional mutation.',
			'persistence:rewrite': 'Owns its optional effect.',
		},
		version: '1.0.0',
		contributions: [
			provideSchemaMutationHandler({
				contributionId: 'dormant-handler',
				create: () => ({
					value: schemaMutationHandler({
						mutation: dormantMutation,
						resolve: () => ({ data: {} }),
					}),
				}),
			}),
			contributeDeclarations({
				operations: ({ operations }) => {
					operations.declare(dormantMutation)

					return undefined
				},
			}),
		],
	})
	const database = createPlugin({
		core: '^0.0.0',
		id: 'fixture.schema-mutation-dormant-database',
		version: '1.0.0',
		contributions: [
			provideTestDatabaseAdapter(new RecordingDatabaseAdapter([], [])),
		],
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
