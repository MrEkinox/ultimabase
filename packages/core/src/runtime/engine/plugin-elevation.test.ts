import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it, vi } from 'vitest'

import { applicationFixture } from '../../../tests/application-fixture.js'
import { provideCapability } from '../../plugins/capabilities.js'
import { contributeOperation } from '../../plugins/plugin-command-contributions.js'
import { withPluginPrivileges } from '../../plugins/plugin-contributions.js'
import {
	defineOperation,
	defineOperationValue,
} from '../../plugins/plugin-operations.js'
import { plugin as createPlugin } from '../../plugins/plugin.js'
import { MemoryPrivateAdapter } from '../../private-storage/runtime.test-support.js'
import { UltimaBase } from '../application/ultima-base.js'
import { databaseAdapterCapability } from '../database/contracts.js'

const ElevationRecord = UltimaBase.Schema.define({
	className: 'ElevationRecord',
	fields: (field) => ({ title: field.string({ required: true }) }),
})

const titleValue = defineOperationValue((value) => {
	if (typeof value !== 'string') throw new TypeError('title must be a string')
	return value
})
const createOperation = defineOperation({
	input: titleValue,
	name: 'fixture.elevation.create',
	result: titleValue,
	target: 'application',
	transaction: 'optional',
	version: '1.0.0',
})

const createApplication = (elevation: boolean) => {
	const logger = {
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
	}
	const operation = contributeOperation({
		operation: createOperation,
		execute: async ({ input }) => {
			await ElevationRecord.createOne(
				{ data: { title: input }, select: {} },
				{ useMasterKey: true },
			)
			return input
		},
	})
	const owner = createPlugin({
		core: '^0.0.0',
		id: 'fixture.elevation',
		version: '1.0.0',
		...(elevation
			? {
					permissions: {
						'authority:elevate':
							'Creates records on behalf of anonymous callers.',
					},
				}
			: {}),
		contributions: [
			elevation
				? withPluginPrivileges(operation, ['authority:elevate'])
				: operation,
		],
	})
	const database = createPlugin({
		core: '^0.0.0',
		id: 'fixture.elevation-database',
		version: '1.0.0',
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: new MemoryPrivateAdapter() }),
			}),
		],
	})
	const ultimabase = applicationFixture(
		new (UltimaBase.use(database, owner))({
			logger,
			logLevel: 'debug',
			schemas: [ElevationRecord],
		}),
	)
	return { logger, ultimabase }
}

describe('plugin elevation without masterAuthority', () => {
	it('lets a plugin holding authority:elevate elevate and audits to the logger', async () => {
		const { logger, ultimabase } = createApplication(true)
		await ultimabase.start()
		expect(
			await ultimabase.operation(createOperation).execute('elevated'),
		).toBe('elevated')
		expect(logger.debug).toHaveBeenCalledWith(
			'Plugin elevated to Master',
			immutableRecord({
				reason: 'Schema command create-one on ElevationRecord',
				requestId: expect.any(String) as string,
			}),
		)
		// Application code still needs a configured authority.
		await expect(
			ElevationRecord.createOne(
				{ data: { title: 'application' } },
				{ useMasterKey: true },
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await ultimabase.dispose()
	})

	it('still requires the exact privilege', async () => {
		const { ultimabase } = createApplication(false)
		await ultimabase.start()
		await expect(
			ultimabase.operation(createOperation).execute('denied'),
		).rejects.toMatchObject({ code: 'PLUGIN_PRIVILEGE_DENIED' })
		await ultimabase.dispose()
	})
})
